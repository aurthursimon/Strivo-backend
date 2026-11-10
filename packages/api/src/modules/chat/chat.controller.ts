import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CurrentUser, JwtAuthGuard, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { ChatService, type MessageEvent } from './chat.service';
import { CreateConversationDto, SendChatMessageDto } from './dto';

@ApiTags('Direct Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Listar todas as conversas diretas do usuario' })
  listConversations(@CurrentUser() user: JwtPayload) {
    return this.chatService.listConversations(user.sub);
  }

  @Post('conversations')
  @RateLimit({ name: 'chat.conversation.create', limit: 30, windowSeconds: 3600, subject: 'user' })
  @ApiOperation({ summary: 'Iniciar ou obter conversa existente com outro usuario' })
  startOrGetConversation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.startOrGetConversation(user.sub, dto);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Obter detalhe de uma conversa com historico de mensagens' })
  getConversation(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.chatService.getConversation(user.sub, id);
  }

  @Post('conversations/:id/messages')
  @RateLimit({ name: 'chat.message.send', limit: 120, windowSeconds: 3600, subject: 'user' })
  @ApiOperation({ summary: 'Enviar mensagem de texto ou imagem para a conversa' })
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(user.sub, id, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar conversa como lida' })
  markAsRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.chatService.markAsRead(user.sub, id);
  }

  @Get('users')
  @ApiOperation({ summary: 'Listar ou buscar membros da comunidade disponiveis para chat' })
  listUsers(@CurrentUser() user: JwtPayload, @Query('search') search?: string) {
    return this.chatService.listAvailableUsers(user.sub, search);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Fluxo SSE em tempo real de mensagens e recibos' })
  stream(@CurrentUser() user: JwtPayload): Observable<MessageEvent> {
    return this.chatService.subscribe(user.sub);
  }
}
