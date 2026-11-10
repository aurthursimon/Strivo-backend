import { Module } from '@nestjs/common';
import { WeeklySummaryProcessor } from './weekly-summary.processor';
import { ReminderProcessor } from './reminder.processor';
import { JobsSchedulerService } from './jobs-scheduler.service';
import { AnalyticsModule } from '../analytics';
import { PushService } from './push.service';
import { ScanAccountCleanupOutbox } from './scan-account-cleanup.outbox';
import { ScanAccountCleanupProcessor } from './scan-account-cleanup.processor';
import { SyncModule } from '../sync';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AnalyticsModule, SyncModule, AuthModule, BillingModule],
  providers: [
    WeeklySummaryProcessor,
    ReminderProcessor,
    JobsSchedulerService,
    PushService,
    ScanAccountCleanupOutbox,
    ScanAccountCleanupProcessor,
  ],
  exports: [PushService],
})
export class JobsModule {}
