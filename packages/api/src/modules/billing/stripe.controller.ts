import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { ClaimStripeCheckoutDto, CreateStripeCheckoutDto } from './dto/create-stripe-checkout.dto';
import { StripeService } from './stripe.service';

@ApiTags('Billing')
@Controller('billing/stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'billing.stripe.checkout', limit: 10, windowSeconds: 3600, subject: 'ip' })
  @ApiOperation({ summary: 'Criar Checkout Session Stripe para assinatura do usuario autenticado' })
  createCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateStripeCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.stripeService.createCheckoutSession(
      user.sub,
      body.plan,
      body.market,
      idempotencyKey ?? body.idempotencyKey,
      body.returnContext,
    );
  }

  @Post('claim')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Vincular Checkout Stripe pago a conta autenticada' })
  claimCheckout(@CurrentUser() user: JwtPayload, @Body() body: ClaimStripeCheckoutDto) {
    return this.stripeService.claimCheckoutSession(user.sub, body.claimToken);
  }
}
