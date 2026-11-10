import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ReferralsModule } from '../referrals';
import { ProductAnalyticsModule } from '../product-analytics';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { GoogleStrategy } from './google.strategy';
import { GoogleOAuthCallbackGuard, GoogleOAuthStartGuard } from './google-oauth.guard';
import { ENV_TOKEN } from '../../config';
import type { Env } from '../../config';
import type { Provider } from '@nestjs/common';

const googleStrategyProvider: Provider = {
  provide: GoogleStrategy,
  useFactory: (env: Env) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return null;
    }
    return new GoogleStrategy(env);
  },
  inject: [ENV_TOKEN],
};

@Module({
  imports: [PassportModule, JwtModule.register({}), ReferralsModule, ProductAnalyticsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailService,
    googleStrategyProvider,
    GoogleOAuthStartGuard,
    GoogleOAuthCallbackGuard,
  ],
  exports: [AuthService, EmailService],
})
export class AuthModule {}
