import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { PrismaModule } from './prisma';
import { ConfigModule } from './config';
import { RateLimitInterceptor, RateLimitService } from './common';
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';
import { GoalsModule } from './modules/goals';
import { FoodDatabaseModule } from './modules/food-database';
import { MealsModule } from './modules/meals';
import { DailyLogModule } from './modules/daily-log';
import { StreaksModule } from './modules/streaks';
import { HealthModule } from './modules/health';
import { BillingModule } from './modules/billing';
import { AnalyticsModule } from './modules/analytics';
import { ProductAnalyticsModule } from './modules/product-analytics';
import { NotificationPreferencesModule } from './modules/notification-preferences';
import { JobsModule } from './modules/jobs';
import { AchievementsModule } from './modules/achievements';
import { ReferralsModule } from './modules/referrals';
import { GamificationModule } from './modules/gamification';
import { MedicationsModule } from './modules/medications';
import { DietModule } from './modules/diet';
import { WorkoutModule } from './modules/workout';
import { OnboardingModule } from './modules/onboarding';
import { LoadTestModule } from './modules/load-test';
import { Glp1Module } from './modules/glp1';
import { SyncModule } from './modules/sync';
import { ScanModule } from './modules/scan';
import { SupportModule } from './modules/support';
import { SupportChatModule } from './modules/support-chat';
import { TrainingModule } from './modules/training/training.module';
import { CommunityModule } from './modules/community';
import { SuggestionsModule } from './modules/suggestions';
import { ChatModule } from './modules/chat';
import { TrainerModule } from './modules/trainer';

const isTruthyEnv = (value: string | undefined) =>
  value ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : false;

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId(req, res) {
          const incoming = req.headers['x-request-id'];
          const requestId =
            typeof incoming === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming)
              ? incoming
              : randomUUID();
          res.setHeader('X-Request-Id', requestId);
          return requestId;
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.headers["x-access-token"]',
            'req.headers["x-load-test-key"]',
            'req.body.signedPayload',
            'req.body.receiptData',
            'req.body.signedTransaction',
            'res.headers["set-cookie"]',
            'req.query.code',
            'req.query.state',
            'req.body.code',
            'req.body.codeVerifier',
            'req.body.refreshToken',
            'req.body.idToken',
            'req.body.identityToken',
            'req.body.assertion',
          ],
          censor: '[Redacted]',
        },
        serializers: {
          req(req) {
            return {
              id: req.id,
              method: req.method,
              url: typeof req.url === 'string' ? req.url.split('?')[0] : req.url,
              remoteAddress: req.remoteAddress,
            };
          },
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        autoLogging: true,
        quietReqLogger: true,
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    GoalsModule,
    FoodDatabaseModule,
    MealsModule,
    DailyLogModule,
    StreaksModule,
    HealthModule,
    BillingModule,
    AnalyticsModule,
    ProductAnalyticsModule,
    NotificationPreferencesModule,
    JobsModule,
    AchievementsModule,
    ReferralsModule,
    GamificationModule,
    MedicationsModule,
    DietModule,
    WorkoutModule,
    Glp1Module,
    SyncModule,
    ScanModule,
    SupportModule,
    SupportChatModule,
    CommunityModule,
    TrainingModule,
    ChatModule,
    TrainerModule,
    SuggestionsModule,
    OnboardingModule,
    ...(isTruthyEnv(process.env.ENABLE_LOAD_TEST) ? [LoadTestModule] : []),
  ],
  controllers: [],
  providers: [
    RateLimitService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RateLimitInterceptor,
    },
  ],
})
export class AppModule {}
