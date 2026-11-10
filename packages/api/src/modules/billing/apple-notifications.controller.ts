import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { RateLimit } from '../../common';
import { AppleStoreService } from './apple-store.service';
import { AppleNotificationDto } from './dto/apple-purchase.dto';
@ApiExcludeController()
@Controller('billing/apple')
export class AppleNotificationsController {
  constructor(private readonly apple: AppleStoreService) {}
  @Post('notifications')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'billing.apple.notifications', limit: 300, windowSeconds: 60, subject: 'ip' })
  handle(@Body() body: AppleNotificationDto) {
    return this.apple.notification(body.signedPayload);
  }
}
