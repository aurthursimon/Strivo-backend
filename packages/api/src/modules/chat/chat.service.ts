import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { PrismaService } from '../../prisma';
import type { CreateConversationDto, SendChatMessageDto } from './dto';

export interface Author {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ChatMessageResponse {
  id: string;
  conversationId: string;
  text: string;
  imageUrl: string | null;
  senderId: string;
  sender: Author;
  createdAt: Date;
}

export interface ConversationSummaryResponse {
  id: string;
  otherUser: Author;
  lastMessage: {
    id: string;
    text: string;
    imageUrl: string | null;
    senderId: string;
    createdAt: Date;
  } | null;
  unreadCount: number;
  updatedAt: Date;
  lastReadAt: Date;
}

export interface ConversationDetailResponse {
  id: string;
  otherUser: Author;
  otherUserLastReadAt: Date | null;
  messages: ChatMessageResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatStreamEvent {
  type: 'new_message' | 'read_receipt' | 'ping';
  conversationId?: string;
  data: unknown;
}

export interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

const AUTHOR_SELECT = { id: true, name: true, avatarUrl: true } as const;

@Injectable()
export class ChatService {
  private readonly userStreams = new Map<string, Subject<MessageEvent>>();

  constructor(private readonly prisma: PrismaService) {}

  subscribe(userId: string): Observable<MessageEvent> {
    let subject = this.userStreams.get(userId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.userStreams.set(userId, subject);
    }

    return new Observable<MessageEvent>((subscriber) => {
      // Send initial connect ping
      subscriber.next({
        type: 'connected',
        data: JSON.stringify({ userId, connectedAt: new Date().toISOString() }),
      });

      const subscription = subject.subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        if (subject && subject.observers.length === 0) {
          this.userStreams.delete(userId);
        }
      };
    });
  }

  private emitToUser(userId: string, event: ChatStreamEvent): void {
    const subject = this.userStreams.get(userId);
    if (subject && subject.observers.length > 0) {
      subject.next({
        type: event.type,
        data: JSON.stringify(event),
      });
    }
  }

  async listConversations(userId: string): Promise<ConversationSummaryResponse[]> {
    const participants = await this.prisma.directChatParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              where: { userId: { not: userId } },
              include: { user: { select: AUTHOR_SELECT } },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: AUTHOR_SELECT } },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const results: ConversationSummaryResponse[] = [];

    for (const p of participants) {
      const otherUser = p.conversation.participants[0]?.user ?? {
        id: 'unknown',
        name: 'User',
        avatarUrl: null,
      };

      const unreadCount = await this.prisma.directChatMessage.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          createdAt: { gt: p.lastReadAt },
          deletedAt: null,
        },
      });

      const lastMsg = p.conversation.messages[0];

      results.push({
        id: p.conversationId,
        otherUser,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              text: lastMsg.text,
              imageUrl: lastMsg.imageUrl,
              senderId: lastMsg.senderId,
              createdAt: lastMsg.createdAt,
            }
          : null,
        unreadCount,
        updatedAt: p.conversation.updatedAt,
        lastReadAt: p.lastReadAt,
      });
    }

    return results;
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDetailResponse> {
    const myParticipant = await this.prisma.directChatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!myParticipant) {
      throw new ForbiddenException({
        code: 'NOT_CONVERSATION_PARTICIPANT',
        message: 'Voce nao participa desta conversa.',
      });
    }

    const conversation = await this.prisma.directChatConversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: { user: { select: AUTHOR_SELECT } },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    const otherParticipant = conversation.participants.find((p) => p.userId !== userId);

    const messages = await this.prisma.directChatMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { sender: { select: AUTHOR_SELECT } },
    });

    // Mark as read up to current timestamp
    await this.prisma.directChatParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    return {
      id: conversation.id,
      otherUser: otherParticipant?.user ?? { id: 'unknown', name: 'User', avatarUrl: null },
      otherUserLastReadAt: otherParticipant?.lastReadAt ?? null,
      messages: messages.map((m) => ({
        id: m.id,
        conversationId,
        text: m.text,
        imageUrl: m.imageUrl,
        senderId: m.senderId,
        sender: m.sender,
        createdAt: m.createdAt,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  async startOrGetConversation(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<{ id: string; otherUser: Author }> {
    const { recipientUserId } = dto;
    if (recipientUserId === userId) {
      throw new BadRequestException({
        code: 'SELF_CHAT_NOT_ALLOWED',
        message: 'Voce nao pode iniciar uma conversa consigo mesmo.',
      });
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientUserId },
      select: AUTHOR_SELECT,
    });
    if (!recipient) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    let conversation = await this.prisma.directChatConversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: recipientUserId } } },
        ],
      },
      include: {
        participants: {
          include: { user: { select: AUTHOR_SELECT } },
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.directChatConversation.create({
        data: {
          participants: {
            create: [{ userId }, { userId: recipientUserId }],
          },
        },
        include: {
          participants: {
            include: { user: { select: AUTHOR_SELECT } },
          },
        },
      });
    }

    const otherParticipant = conversation.participants.find((p) => p.userId !== userId);

    return {
      id: conversation.id,
      otherUser: otherParticipant?.user ?? recipient,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendChatMessageDto,
  ): Promise<ChatMessageResponse> {
    const myParticipant = await this.prisma.directChatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!myParticipant) {
      throw new ForbiddenException({
        code: 'NOT_CONVERSATION_PARTICIPANT',
        message: 'Voce nao participa desta conversa.',
      });
    }

    const text = (dto.text ?? '').trim();
    if (!text && !dto.imageUrl) {
      throw new BadRequestException({
        code: 'EMPTY_MESSAGE',
        message: 'A mensagem deve conter texto ou imagem.',
      });
    }

    const now = new Date();

    const message = await this.prisma.directChatMessage.create({
      data: {
        conversationId,
        senderId: userId,
        text,
        imageUrl: dto.imageUrl ?? null,
        createdAt: now,
      },
      include: {
        sender: { select: AUTHOR_SELECT },
      },
    });

    await this.prisma.directChatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
    });

    await this.prisma.directChatParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now },
    });

    const serialized: ChatMessageResponse = {
      id: message.id,
      conversationId,
      text: message.text,
      imageUrl: message.imageUrl,
      senderId: message.senderId,
      sender: message.sender,
      createdAt: message.createdAt,
    };

    const participants = await this.prisma.directChatParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    for (const p of participants) {
      this.emitToUser(p.userId, {
        type: 'new_message',
        conversationId,
        data: serialized,
      });
    }

    return serialized;
  }

  async markAsRead(
    userId: string,
    conversationId: string,
  ): Promise<{ success: boolean; readAt: Date }> {
    const readAt = new Date();
    await this.prisma.directChatParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: readAt },
    });

    const otherParticipants = await this.prisma.directChatParticipant.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });

    for (const p of otherParticipants) {
      this.emitToUser(p.userId, {
        type: 'read_receipt',
        conversationId,
        data: { readerId: userId, readAt },
      });
    }

    return { success: true, readAt };
  }

  async listAvailableUsers(userId: string, search?: string): Promise<Author[]> {
    const trimmed = search?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        deletedAt: null,
        ...(trimmed
          ? {
              OR: [
                { name: { contains: trimmed, mode: 'insensitive' } },
                { email: { contains: trimmed, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: AUTHOR_SELECT,
      take: 30,
      orderBy: { name: 'asc' },
    });

    return users;
  }
}
