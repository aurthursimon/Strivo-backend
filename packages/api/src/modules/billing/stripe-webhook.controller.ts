import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { StripeService } from './stripe.service';

@Controller('billing/stripe')
export class StripeWebhookController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    const event = this.stripeService.constructWebhookEvent(
      request.rawBody ?? Buffer.alloc(0),
      signature,
    );
    await this.stripeService.handleWebhookEvent(event);
    return { received: true };
  }
}
