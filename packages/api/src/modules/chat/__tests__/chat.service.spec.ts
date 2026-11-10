import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from '../chat.service';
import { PrismaService } from '../../../prisma';

const USER_ME = { id: 'user-me', name: 'Alice', avatarUrl: 'preset:flame' };
const USER_OTHER = { id: 'user-other', name: 'Bob', avatarUrl: 'preset:star' };

const mockPrisma = {
  directChatParticipant: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  directChatConversation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  directChatMessage: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChatService(mockPrisma as unknown as PrismaService);
  });

  describe('listConversations', () => {
    it('retorna a lista de conversas com outro usuario e unreadCount', async () => {
      mockPrisma.directChatParticipant.findMany.mockResolvedValue([
        {
          conversationId: 'conv-1',
          lastReadAt: new Date('2026-10-01T00:00:00Z'),
          conversation: {
            updatedAt: new Date('2026-10-01T12:00:00Z'),
            participants: [{ user: USER_OTHER }],
            messages: [
              {
                id: 'msg-1',
                text: 'Oi, tudo bem?',
                imageUrl: null,
                senderId: 'user-other',
                createdAt: new Date('2026-10-01T12:00:00Z'),
              },
            ],
          },
        },
      ]);
      mockPrisma.directChatMessage.count.mockResolvedValue(1);

      const result = await service.listConversations('user-me');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('conv-1');
      expect(result[0]?.otherUser).toEqual(USER_OTHER);
      expect(result[0]?.unreadCount).toBe(1);
      expect(result[0]?.lastMessage?.text).toBe('Oi, tudo bem?');
    });
  });

  describe('startOrGetConversation', () => {
    it('rejeita criar conversa consigo mesmo', async () => {
      await expect(
        service.startOrGetConversation('user-me', { recipientUserId: 'user-me' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita quando destinatario nao existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.startOrGetConversation('user-me', { recipientUserId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('retorna conversa existente se ja houver', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER_OTHER);
      mockPrisma.directChatConversation.findFirst.mockResolvedValue({
        id: 'conv-existing',
        participants: [{ userId: 'user-me', user: USER_ME }, { userId: 'user-other', user: USER_OTHER }],
      });

      const result = await service.startOrGetConversation('user-me', {
        recipientUserId: 'user-other',
      });

      expect(result.id).toBe('conv-existing');
      expect(result.otherUser).toEqual(USER_OTHER);
    });
  });

  describe('sendMessage', () => {
    it('rejeita mensagem de usuario que nao e participante', async () => {
      mockPrisma.directChatParticipant.findUnique.mockResolvedValue(null);

      await expect(
        service.sendMessage('user-intruder', 'conv-1', { text: 'Ola' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejeita mensagem sem texto e sem imagem', async () => {
      mockPrisma.directChatParticipant.findUnique.mockResolvedValue({
        conversationId: 'conv-1',
        userId: 'user-me',
      });

      await expect(
        service.sendMessage('user-me', 'conv-1', { text: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('cria mensagem e atualiza conversa', async () => {
      mockPrisma.directChatParticipant.findUnique.mockResolvedValue({
        conversationId: 'conv-1',
        userId: 'user-me',
      });
      mockPrisma.directChatMessage.create.mockResolvedValue({
        id: 'msg-new',
        conversationId: 'conv-1',
        senderId: 'user-me',
        text: 'Mensagem teste',
        imageUrl: null,
        createdAt: new Date('2026-10-01T15:00:00Z'),
        sender: USER_ME,
      });
      mockPrisma.directChatConversation.update.mockResolvedValue({});
      mockPrisma.directChatParticipant.update.mockResolvedValue({});
      mockPrisma.directChatParticipant.findMany.mockResolvedValue([
        { userId: 'user-me' },
        { userId: 'user-other' },
      ]);

      const result = await service.sendMessage('user-me', 'conv-1', { text: 'Mensagem teste' });

      expect(result.id).toBe('msg-new');
      expect(result.text).toBe('Mensagem teste');
      expect(mockPrisma.directChatMessage.create).toHaveBeenCalled();
      expect(mockPrisma.directChatConversation.update).toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('atualiza lastReadAt do participante', async () => {
      mockPrisma.directChatParticipant.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.directChatParticipant.findMany.mockResolvedValue([{ userId: 'user-other' }]);

      const result = await service.markAsRead('user-me', 'conv-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.directChatParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1', userId: 'user-me' },
        }),
      );
    });
  });
});
