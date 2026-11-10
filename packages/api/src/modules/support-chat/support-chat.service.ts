import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { SupportChatRole } from '@prisma/client';
import { ENV_TOKEN, type Env } from '../../config';
import { PrismaService } from '../../prisma';
import { GeminiChatClient, GeminiChatError, type GeminiChatMessage } from './gemini-chat.client';
import { SUPPORT_CHAT_SYSTEM_PROMPT } from './system-prompt';
import type { SendMessageDto } from './dto';

// Keeps the per-request token cost (and the chance of a very old, possibly
// off-topic exchange derailing a new question) bounded - only the most
// recent messages are sent to the model as context. Everything is still
// persisted and shown in the UI; this only limits what the model itself
// sees.
const MAX_HISTORY_MESSAGES_FOR_MODEL = 20;
// A hard ceiling on a single conversation's total size, independent of the
// per-user hourly rate limit on the controller - that limits how often
// someone can message, this limits how large any one thread can grow, so
// neither storage nor a single very long thread's cost is unbounded.
const MAX_MESSAGES_PER_CONVERSATION = 60;
const TITLE_MAX_LENGTH = 60;

export interface ChatMessageResponse {
  id: string;
  role: SupportChatRole;
  text: string;
  createdAt: Date;
}

export interface ChatConversationResponse {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessageResponse[];
}

export interface ChatConversationSummary {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SupportChatService {
  private readonly logger = new Logger('SupportChat');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.env.SUPPORT_CHAT_GEMINI_API_KEY);
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'SUPPORT_CHAT_NOT_CONFIGURED',
        message: 'O suporte com IA ainda nao esta configurado neste ambiente.',
      });
    }
  }

  private buildClient(): GeminiChatClient {
    return new GeminiChatClient({
      // requireConfigured() already asserted this is set.
      apiKey: this.env.SUPPORT_CHAT_GEMINI_API_KEY as string,
      model: this.env.SUPPORT_CHAT_GEMINI_MODEL,
      timeoutMs: this.env.SUPPORT_CHAT_TIMEOUT_MS,
    });
  }

  async listConversations(userId: string): Promise<ChatConversationSummary[]> {
    const conversations = await this.prisma.supportChatConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return conversations;
  }

  async getConversation(userId: string, conversationId: string): Promise<ChatConversationResponse> {
    const conversation = await this.findOwnedConversation(userId, conversationId);
    return this.toConversationResponse(conversation.id, conversation.title, conversation.createdAt, conversation.updatedAt, conversation.messages);
  }

  async createConversation(userId: string, dto: SendMessageDto): Promise<ChatConversationResponse> {
    this.requireConfigured();

    const conversation = await this.prisma.supportChatConversation.create({
      data: { userId, title: dto.text.slice(0, TITLE_MAX_LENGTH) },
    });
    const userMessage = await this.prisma.supportChatMessage.create({
      data: { conversationId: conversation.id, role: 'USER', text: dto.text },
    });

    const assistantMessage = await this.replyTo(conversation.id, [userMessage]);

    return this.toConversationResponse(
      conversation.id,
      conversation.title,
      conversation.createdAt,
      assistantMessage.createdAt,
      [userMessage, assistantMessage],
    );
  }

  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto): Promise<ChatConversationResponse> {
    this.requireConfigured();

    const conversation = await this.findOwnedConversation(userId, conversationId);
    if (conversation.messages.length >= MAX_MESSAGES_PER_CONVERSATION) {
      throw new BadRequestException({
        code: 'CONVERSATION_MESSAGE_LIMIT_REACHED',
        message: 'Esta conversa atingiu o limite de mensagens. Inicie uma nova conversa.',
      });
    }

    const userMessage = await this.prisma.supportChatMessage.create({
      data: { conversationId, role: 'USER', text: dto.text },
    });
    const history = [...conversation.messages, userMessage];
    const assistantMessage = await this.replyTo(conversationId, history);

    return this.toConversationResponse(
      conversation.id,
      conversation.title,
      conversation.createdAt,
      assistantMessage.createdAt,
      [...history, assistantMessage],
    );
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    // findOwnedConversation 404s if this user doesn't own it (or it doesn't
    // exist) - delete never runs against another user's conversation.
    await this.findOwnedConversation(userId, conversationId);
    await this.prisma.supportChatConversation.delete({ where: { id: conversationId } });
  }

  private async findOwnedConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.supportChatConversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversa nao encontrada.');
    return conversation;
  }

  /**
   * Calls Gemini with only the minimal context it needs - the fixed system
   * prompt (see system-prompt.ts, never user-specific) plus the last
   * MAX_HISTORY_MESSAGES_FOR_MODEL messages of THIS conversation. No health
   * profile, weight, doses, or other account data is ever read or sent
   * here, by construction: this method only ever touches the message rows
   * it was handed. On any provider failure the user's own message (already
   * persisted by the caller before this runs) is preserved either way -
   * only the assistant's reply is missing, not the question.
   */
  private async replyTo(conversationId: string, history: { role: SupportChatRole; text: string }[]) {
    const client = this.buildClient();
    const recentHistory: GeminiChatMessage[] = history.slice(-MAX_HISTORY_MESSAGES_FOR_MODEL).map((message) => ({
      role: message.role === 'ASSISTANT' ? 'model' : 'user',
      text: message.text,
    }));

    let replyText: string;
    try {
      replyText = await client.sendMessage(SUPPORT_CHAT_SYSTEM_PROMPT, recentHistory);
    } catch (error) {
      const geminiError = error instanceof GeminiChatError ? error : undefined;
      this.logger.warn(
        {
          conversationId,
          code: geminiError?.code ?? 'UNKNOWN',
          status: geminiError?.status,
          error: error instanceof Error ? error.message : 'unknown',
        },
        'Support chat provider call failed.',
      );
      throw new ServiceUnavailableException({
        code: 'SUPPORT_CHAT_PROVIDER_ERROR',
        message: 'Nao foi possivel obter uma resposta agora. Tente novamente em instantes.',
      });
    }

    const assistantMessage = await this.prisma.supportChatMessage.create({
      data: { conversationId, role: 'ASSISTANT', text: replyText },
    });
    await this.prisma.supportChatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return assistantMessage;
  }

  private toConversationResponse(
    id: string,
    title: string | null,
    createdAt: Date,
    updatedAt: Date,
    messages: { id: string; role: SupportChatRole; text: string; createdAt: Date }[],
  ): ChatConversationResponse {
    return {
      id,
      title,
      createdAt,
      updatedAt,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
      })),
    };
  }
}
