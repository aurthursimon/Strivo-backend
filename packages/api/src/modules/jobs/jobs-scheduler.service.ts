import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ReminderProcessor } from './reminder.processor';
import { WeeklySummaryProcessor } from './weekly-summary.processor';
import { ScanAccountCleanupProcessor } from './scan-account-cleanup.processor';
import { SyncMaintenanceService } from '../sync';

@Injectable()
export class JobsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private tickRunning = false;
  private readonly completed = new Set<string>();

  constructor(
    private readonly weeklySummary: WeeklySummaryProcessor,
    private readonly reminders: ReminderProcessor,
    private readonly scanAccountCleanup: ScanAccountCleanupProcessor,
    private readonly syncMaintenance: SyncMaintenanceService,
  ) {}

  onModuleInit() {
    if (process.env.BACKGROUND_JOBS_ENABLED === 'false') return;
    void this.requestTick();
    this.timer = setInterval(() => void this.requestTick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runOnce(key: string, task: () => Promise<void>) {
    if (this.completed.has(key)) return;
    this.completed.add(key);
    try {
      await task();
    } catch (error) {
      this.completed.delete(key);
      this.logger.error(`${key} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async requestTick(): Promise<void> {
    if (this.tickRunning) return;
    this.tickRunning = true;
    try {
      await this.tick();
    } finally {
      this.tickRunning = false;
    }
  }

  private async tick() {
    try {
      await this.scanAccountCleanup.processBatch();
    } catch {
      this.logger.error('Scan account cleanup scheduler tick failed.');
    }

    const now = new Date();
    const hourKey = now.toISOString().slice(0, 13);
    const dayKey = now.toISOString().slice(0, 10);

    await this.runOnce(`sync-maintenance:${dayKey}`, async () => {
      const result = await this.syncMaintenance.run(now);
      if (result.expiredBootstrapSessions > 0 || result.expiredTerminalMutations > 0) {
        this.logger.log(
          `Sync maintenance bootstrap=${result.expiredBootstrapSessions} mutations=${result.expiredTerminalMutations}`,
        );
      }
    });

    if (now.getUTCMinutes() === 10) {
      await this.runOnce(`hourly:${hourKey}`, () =>
        this.reminders.process({ type: 'hourly-reminders' }),
      );
    }
    if (now.getUTCHours() === 21 && now.getUTCMinutes() === 0) {
      await this.runOnce(`streak:${dayKey}`, () => this.reminders.process({ type: 'streak' }));
    }
    if (now.getUTCDay() === 1 && now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
      await this.runOnce(`weekly:${dayKey}`, () => this.weeklySummary.process());
    }

    if (this.completed.size > 200) {
      const activePrefix = dayKey.slice(0, 7);
      for (const key of this.completed) if (!key.includes(activePrefix)) this.completed.delete(key);
    }
  }
}
