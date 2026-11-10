import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BillingController } from './billing.controller';
import { AppleNotificationsController } from './apple-notifications.controller';
import { AppleStoreService } from './apple-store.service';
import { APPLE_STORE_GATEWAY, AppleStoreGateway } from './apple-store.gateway';
import { ENV_TOKEN, type Env } from '../../config';
import { StripeController } from './stripe.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionAccessService } from './subscription-access.service';
import { EntitlementService } from './entitlement.service';
import { MetaCapiService } from './meta-capi.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    BillingController,
    AppleNotificationsController,
    StripeController,
    StripeWebhookController,
  ],
  providers: [
    {
      provide: APPLE_STORE_GATEWAY,
      useFactory: (env: Env) => new AppleStoreGateway(env),
      inject: [ENV_TOKEN],
    },
    SubscriptionAccessService,
    EntitlementService,
    AppleStoreService,
    StripeService,
    MetaCapiService,
  ],
  exports: [SubscriptionAccessService, EntitlementService, AppleStoreService, StripeService],
})
export class BillingModule {}
