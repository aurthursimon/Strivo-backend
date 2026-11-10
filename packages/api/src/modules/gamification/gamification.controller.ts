import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import { PointsEventDto } from './dto';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';

@ApiTags('Gamification')
@Controller('gamification')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Perfil de gamificacao do usuario' })
  @ApiResponse({ status: 200, description: 'Perfil com pontos, nivel, badges e eventos recentes' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.gamificationService.getProfile(user.sub);
  }

  @Get('badges')
  @ApiOperation({ summary: 'Catalogo de badges com estado de desbloqueio do usuario' })
  @ApiResponse({ status: 200, description: 'Lista de badges' })
  getBadges(@CurrentUser() user: JwtPayload) {
    return this.gamificationService.getBadges(user.sub);
  }

  @Post('events')
  @ApiOperation({ summary: 'Ingestao idempotente de evento de pontos (servidor recalcula pontos)' })
  @ApiResponse({ status: 201, description: 'Perfil autoritativo atualizado' })
  recordEvent(@CurrentUser() user: JwtPayload, @Body() dto: PointsEventDto) {
    return this.gamificationService.recordEvent(user.sub, dto);
  }
}
