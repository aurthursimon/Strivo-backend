import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdatePreferencesDto, PushSubscriptionDto } from './dto';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly service: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Obter preferencias de notificacao' })
  @ApiResponse({ status: 200, description: 'Preferencias retornadas' })
  getPreferences(@CurrentUser() user: JwtPayload) {
    return this.service.getPreferences(user.sub);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualizar preferencias de notificacao' })
  @ApiResponse({ status: 200, description: 'Preferencias atualizadas' })
  updatePreferences(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePreferencesDto) {
    return this.service.updatePreferences(user.sub, dto);
  }

  @Post('push-subscription')
  @ApiOperation({ summary: 'Registrar push subscription' })
  @ApiResponse({ status: 201, description: 'Push subscription registrada' })
  registerPushSubscription(@CurrentUser() user: JwtPayload, @Body() dto: PushSubscriptionDto) {
    return this.service.registerPushSubscription(user.sub, dto.subscription);
  }
}
