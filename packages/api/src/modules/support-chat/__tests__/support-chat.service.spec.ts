import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupportChatService } from '../support-chat.service';
import { PrismaService } from '../../../prisma';
import { GeminiChatError } from '../gemini-chat.client';

const mockSendMessage = jest.fn();

jest.mock('../gemini-chat.client', () => {
  const actual = jest.requireActual('../gemini-chat.client');
  return {
    ...actual,
    GeminiChatClient: jest.fn().mockImplementation(() => ({ sendMessage: mockSendMessage })),
  };
});

const mockPrisma = {
  supportChatConversation: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  supportChatMessage: {
    create: jest.fn(),
  },
};

const ENV = {
  SUPPORT_CHAT_GEMINI_API_KEY: 'test-key',
  SUPPORT_CHAT_GEMINI_MODEL: 'gemini-2.5-flash-lite',
  SUPPORT_CHAT_TIMEOUT_MS: 15_000,
};

function conversationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'conv-1',
    userId: 'user-1',
    title: 'Como troco minha senha?',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    messages: [],
    ...overrides,
  };
}

describe('SupportChatService', () => {
  let service: SupportChatService;
  let env: Omit<typeof ENV, 'SUPPORT_CHAT_GEMINI_API_KEY'> & { SUPPORT_CHAT_GEMINI_API_KEY?: string };

  beforeEach(() => {
    jest.clearAllMocks();
    env = { ...ENV };
    service = new SupportChatService(mockPrisma as unknown as PrismaService, env as never);
  });

  describe('configuration', () => {
    it('rejeita criar uma conversa com 503 quando a chave do Gemini nao esta configurada', async () => {
      env.SUPPORT_CHAT_GEMINI_API_KEY = undefined;

      await expect(service.createConversation('user-1', { text: 'Oi' })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockPrisma.supportChatConversation.create).not.toHaveBeenCalled();
    });

    it('rejeita enviar mensagem com 503 quando a chave do Gemini nao esta configurada', async () => {
      env.SUPPORT_CHAT_GEMINI_API_KEY = undefined;

      await expect(service.sendMessage('user-1', 'conv-1', { text: 'Oi' })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockPrisma.supportChatConversation.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('createConversation', () => {
    it('persiste a conversa e a mensagem do usuario mesmo que o Gemini falhe', async () => {
      mockPrisma.supportChatConversation.create.mockResolvedValue(conversationRow());
      mockPrisma.supportChatMessage.create.mockResolvedValueOnce({
        id: 'msg-user-1',
        conversationId: 'conv-1',
        role: 'USER',
        text: 'Como troco minha senha?',
        createdAt: new Date('2026-10-01T10:00:00Z'),
      });
      mockSendMessage.mockRejectedValue(new GeminiChatError('PROVIDER_ERROR', 'boom', { status: 503 }));

      await expect(
        service.createConversation('user-1', { text: 'Como troco minha senha?' }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockPrisma.supportChatConversation.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', title: 'Como troco minha senha?' },
      });
      expect(mockPrisma.supportChatMessage.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv-1', role: 'USER', text: 'Como troco minha senha?' },
      });
    });

    it('cria a conversa e retorna a resposta do assistente quando o Gemini responde', async () => {
      mockPrisma.supportChatConversation.create.mockResolvedValue(conversationRow());
      mockPrisma.supportChatMessage.create
        .mockResolvedValueOnce({
          id: 'msg-user-1',
          conversationId: 'conv-1',
          role: 'USER',
          text: 'Como troco minha senha?',
          createdAt: new Date('2026-10-01T10:00:00Z'),
        })
        .mockResolvedValueOnce({
          id: 'msg-assistant-1',
          conversationId: 'conv-1',
          role: 'ASSISTANT',
          text: 'Voce pode redefinir sua senha na tela de login.',
          createdAt: new Date('2026-10-01T10:00:01Z'),
        });
      mockPrisma.supportChatConversation.update.mockResolvedValue({});
      mockSendMessage.mockResolvedValue('Voce pode redefinir sua senha na tela de login.');

      const result = await service.createConversation('user-1', { text: 'Como troco minha senha?' });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[1]).toMatchObject({ role: 'ASSISTANT', text: 'Voce pode redefinir sua senha na tela de login.' });
    });
  });

  describe('ownership', () => {
    it('rejeita com 404 ao buscar uma conversa de outro usuario', async () => {
      mockPrisma.supportChatConversation.findFirst.mockResolvedValue(null);

      await expect(service.getConversation('user-1', 'conv-of-someone-else')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.supportChatConversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'conv-of-someone-else', userId: 'user-1' },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    });

    it('rejeita enviar mensagem em uma conversa de outro usuario', async () => {
      mockPrisma.supportChatConversation.findFirst.mockResolvedValue(null);

      await expect(service.sendMessage('user-1', 'conv-of-someone-else', { text: 'Oi' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('rejeita excluir uma conversa de outro usuario e nunca chama delete', async () => {
      mockPrisma.supportChatConversation.findFirst.mockResolvedValue(null);

      await expect(service.deleteConversation('user-1', 'conv-of-someone-else')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.supportChatConversation.delete).not.toHaveBeenCalled();
    });

    it('exclui a propria conversa quando o dono e quem esta pedindo', async () => {
      mockPrisma.supportChatConversation.findFirst.mockResolvedValue(conversationRow());
      mockPrisma.supportChatConversation.delete.mockResolvedValue({});

      await service.deleteConversation('user-1', 'conv-1');

      expect(mockPrisma.supportChatConversation.delete).toHaveBeenCalledWith({ where: { id: 'conv-1' } });
    });
  });

  describe('limits', () => {
    it('rejeita nova mensagem quando a conversa ja atingiu o limite de mensagens', async () => {
      const manyMessages = Array.from({ length: 60 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
        text: `mensagem ${i}`,
        createdAt: new Date(),
      }));
      mockPrisma.supportChatConversation.findFirst.mockResolvedValue(
        conversationRow({ messages: manyMessages }),
      );

      await expect(service.sendMessage('user-1', 'conv-1', { text: 'mais uma' })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.supportChatMessage.create).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('envia ao Gemini apenas as ultimas 20 mensagens do historico, nao a conversa inteira', async () => {
      const oldMessages = Array.from({ length: 30 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
        text: `mensagem antiga ${i}`,
        createdAt: new Date(),
      }));
      mockPrisma.supportChatConversation.findFirst.mockResolvedValue(
        conversationRow({ messages: oldMessages }),
      );
      mockPrisma.supportChatMessage.create.mockResolvedValueOnce({
        id: 'msg-new',
        role: 'USER',
        text: 'mensagem nova',
        createdAt: new Date(),
      });
      mockPrisma.supportChatMessage.create.mockResolvedValueOnce({
        id: 'msg-reply',
        role: 'ASSISTANT',
        text: 'resposta',
        createdAt: new Date(),
      });
      mockPrisma.supportChatConversation.update.mockResolvedValue({});
      mockSendMessage.mockResolvedValue('resposta');

      await service.sendMessage('user-1', 'conv-1', { text: 'mensagem nova' });

      const sentHistory = mockSendMessage.mock.calls[0][1];
      // 30 old + 1 new = 31 total, capped to the most recent 20.
      expect(sentHistory).toHaveLength(20);
      expect(sentHistory[sentHistory.length - 1]).toEqual({ role: 'user', text: 'mensagem nova' });
    });
  });

  describe('provider errors', () => {
    it('converte uma falha do Gemini em 503 sem derrubar o processo, preservando a mensagem do usuario', async () => {
      mockPrisma.supportChatConversation.findFirst.mockResolvedValue(conversationRow());
      mockPrisma.supportChatMessage.create.mockResolvedValueOnce({
        id: 'msg-user-2',
        role: 'USER',
        text: 'Oi',
        createdAt: new Date(),
      });
      mockSendMessage.mockRejectedValue(new GeminiChatError('TIMEOUT', 'demorou demais'));

      await expect(service.sendMessage('user-1', 'conv-1', { text: 'Oi' })).rejects.toThrow(
        ServiceUnavailableException,
      );
      // The user's message was already persisted before the provider call -
      // a failed reply never loses the question.
      expect(mockPrisma.supportChatMessage.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv-1', role: 'USER', text: 'Oi' },
      });
    });
  });
});
