import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { SupportService } from './support.service';
import { ContactSupportDto } from './dto';

@ApiTags('Support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('contact')
  @RateLimit({ name: 'support.contact', limit: 5, windowSeconds: 3600, subject: 'ip-user' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Enviar mensagem de suporte' })
  @ApiResponse({ status: 204, description: 'Mensagem enviada' })
  @ApiResponse({ status: 503, description: 'Suporte por e-mail nao configurado' })
  async contact(@CurrentUser() user: JwtPayload, @Body() dto: ContactSupportDto) {
    await this.supportService.contact(user.sub, dto);
  }
}
