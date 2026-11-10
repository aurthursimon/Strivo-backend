import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { SendMessageDto } from './dto';
import { SupportChatService } from './support-chat.service';

@ApiTags('Support Chat')
@Controller('support/chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportChatController {
  constructor(private readonly supportChatService: SupportChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Listar as proprias conversas do chat de suporte' })
  listConversations(@CurrentUser() user: JwtPayload) {
    return this.supportChatService.listConversations(user.sub);
  }

  @Post('conversations')
  // Shares one bucket with the follow-up send below (same `name`) - this
  // caps total AI messages per user per hour, not "new conversations"
  // separately from "replies in an existing one".
  @RateLimit({ name: 'support.chat.send', limit: 20, windowSeconds: 3600, subject: 'user' })
  @ApiOperation({ summary: 'Iniciar uma conversa com a primeira mensagem' })
  createConversation(@CurrentUser() user: JwtPayload, @Body() dto: SendMessageDto) {
    return this.supportChatService.createConversation(user.sub, dto);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Detalhe de uma conversa, com as mensagens' })
  getConversation(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.supportChatService.getConversation(user.sub, id);
  }

  @Post('conversations/:id/messages')
  @RateLimit({ name: 'support.chat.send', limit: 20, windowSeconds: 3600, subject: 'user' })
  @ApiOperation({ summary: 'Enviar uma mensagem em uma conversa existente' })
  sendMessage(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.supportChatService.sendMessage(user.sub, id, dto);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir a propria conversa' })
  async deleteConversation(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.supportChatService.deleteConversation(user.sub, id);
  }
}
