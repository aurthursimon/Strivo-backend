import { Injectable, Logger } from '@nestjs/common';
import {
  ScanAccountCleanupOutbox,
  type ClaimedScanAccountCleanupTask,
} from './scan-account-cleanup.outbox';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class ScanAccountCleanupProcessor {
  private readonly logger = new Logger(ScanAccountCleanupProcessor.name);

  constructor(
    private readonly outbox: ScanAccountCleanupOutbox,
    private readonly auth: AuthService,
  ) {}

  async processBatch(): Promise<{ claimed: number; completed: number; retried: number }> {
    const tasks = await this.outbox.claimBatch();
    let completed = 0;
    let retried = 0;
    await Promise.all(
      tasks.map(async (task) => {
        const result = await this.processTask(task);
        if (result === 'completed') completed += 1;
        if (result === 'retried') retried += 1;
      }),
    );
    const pruned = await this.outbox.pruneCompleted();
    const leaseLost = tasks.length - completed - retried;
    if (tasks.length > 0 || pruned > 0) {
      this.logger.log(
        `Scan cleanup batch claimed=${tasks.length} completed=${completed} retried=${retried} leaseLost=${leaseLost} pruned=${pruned}`,
      );
    }
    return { claimed: tasks.length, completed, retried };
  }

  private async processTask(
    task: ClaimedScanAccountCleanupTask,
  ): Promise<'completed' | 'retried' | 'lease-lost'> {
    try {
      let failureCode: string | undefined;

      if (task.appleRevocationRequired && !task.appleRevokedAt) {
        if (!task.appleCredential) {
          failureCode ??= 'APPLE_REVOCATION_CREDENTIAL_INVALID';
        } else {
          let appleRevoked = false;
          try {
            await this.auth.revokeAppleAuthorizationCredential(task.appleCredential);
            appleRevoked = true;
          } catch {
            failureCode ??= 'APPLE_REVOCATION_FAILED';
          }
          if (appleRevoked && !(await this.outbox.markAppleRevoked(task))) return 'lease-lost';
        }
      }

      // Compatibility checkpoint for stored cleanup jobs; StoreKit has no remote customer profile.
      if (!task.revenueCatDeletedAt && !(await this.outbox.markRevenueCatDeleted(task)))
        return 'lease-lost';

      if (failureCode) {
        return (await this.outbox.retry(task, failureCode)) ? 'retried' : 'lease-lost';
      }
      return (await this.outbox.complete(task)) ? 'completed' : 'lease-lost';
    } catch {
      return (await this.outbox.retry(task, 'ACCOUNT_CLEANUP_UNEXPECTED'))
        ? 'retried'
        : 'lease-lost';
    }
  }
}
