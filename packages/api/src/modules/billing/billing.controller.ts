import { Controller, Body, Post, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { SubscriptionAccessService } from './subscription-access.service';
import { AppleStoreService } from './apple-store.service';
import { VerifyApplePurchaseDto } from './dto/apple-purchase.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly subscriptionAccessService: SubscriptionAccessService,
    private readonly apple: AppleStoreService,
  ) {}

  @Get('apple/account-token')
  @RateLimit({ name: 'billing.apple.account', limit: 30, windowSeconds: 60, subject: 'user' })
  accountToken(@CurrentUser() user: JwtPayload) {
    return this.apple.accountToken(user.sub);
  }

  @Post('apple/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'billing.apple.verify', limit: 30, windowSeconds: 60, subject: 'user' })
  verifyApple(@CurrentUser() user: JwtPayload, @Body() body: VerifyApplePurchaseDto) {
    return this.apple.verify(user.sub, body.transactionId, body.receiptData, body.signedTransaction);
  }

  @Post('apple/reconcile')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'billing.apple.reconcile', limit: 20, windowSeconds: 300, subject: 'user' })
  reconcileApple(@CurrentUser() user: JwtPayload) {
    return this.apple.reconcile(user.sub);
  }

  @Get('status')
  @ApiOperation({ summary: 'Status da assinatura para o usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Status atual' })
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.subscriptionAccessService.getStatusPayload(user.sub);
  }
}
