import {
  ScanAccountCleanupOutbox,
  scanCleanupBackoffMs,
  type ClaimedScanAccountCleanupTask,
} from '../scan-account-cleanup.outbox';
import { ScanAccountCleanupProcessor } from '../scan-account-cleanup.processor';
import { JobsSchedulerService } from '../jobs-scheduler.service';

const task: ClaimedScanAccountCleanupTask = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  subjectId: 'user-1',
  subjectHash: 'f'.repeat(64),
  accountGeneration: 2,
  appleRevocationRequired: false,
  attempts: 1,
  leaseToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

describe('scan account cleanup (Apple revocation + legacy checkpoints)', () => {
  it('completes a task that needs neither Apple revocation nor a RevenueCat retry', async () => {
    const outbox = {
      claimBatch: jest.fn().mockResolvedValue([task]),
      retry: jest.fn().mockResolvedValue(true),
      markAppleRevoked: jest.fn().mockResolvedValue(true),
      markRevenueCatDeleted: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockResolvedValue(true),
      pruneCompleted: jest.fn().mockResolvedValue(0),
    };
    const revenueCat = { deleteCustomer: jest.fn().mockResolvedValue(undefined) };
    const processor = new ScanAccountCleanupProcessor(
      outbox as never,
      { revokeAppleAuthorizationCredential: jest.fn() } as never,
    );

    await expect(processor.processBatch()).resolves.toEqual({
      claimed: 1,
      completed: 1,
      retried: 0,
    });
    expect(revenueCat.deleteCustomer).not.toHaveBeenCalled();
    expect(outbox.markRevenueCatDeleted).toHaveBeenCalledTimes(1);
    expect(outbox.complete).toHaveBeenCalledTimes(1);
  });

  it('retries failed Apple revocation while completing the legacy provider checkpoint', async () => {
    const item = { ...task, appleRevocationRequired: true, appleCredential: { tokenCiphertext: 'cipher', tokenIv: 'iv', tokenTag: 'tag', tokenType: 'refresh_token' } };
    const outbox = { claimBatch: jest.fn().mockResolvedValue([item]), retry: jest.fn().mockResolvedValue(true), markAppleRevoked: jest.fn(), markRevenueCatDeleted: jest.fn().mockResolvedValue(true), complete: jest.fn(), pruneCompleted: jest.fn().mockResolvedValue(0) };
    const auth = { revokeAppleAuthorizationCredential: jest.fn().mockRejectedValue(new Error('temporary')) };
    const processor = new ScanAccountCleanupProcessor(outbox as never, auth as never);
    await expect(processor.processBatch()).resolves.toEqual({ claimed: 1, completed: 0, retried: 1 });
    expect(outbox.retry).toHaveBeenCalledWith(item, 'APPLE_REVOCATION_FAILED');
    expect(outbox.complete).not.toHaveBeenCalled();
    expect(outbox.markRevenueCatDeleted).toHaveBeenCalledTimes(1);
  });

  it('retries when the stored Apple credential is missing but revocation was required', async () => {
    const brokenTask = { ...task, appleRevocationRequired: true };
    const outbox = {
      claimBatch: jest.fn().mockResolvedValue([brokenTask]),
      retry: jest.fn().mockResolvedValue(true),
      markAppleRevoked: jest.fn().mockResolvedValue(true),
      markRevenueCatDeleted: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockResolvedValue(true),
      pruneCompleted: jest.fn().mockResolvedValue(0),
    };
    const auth = { revokeAppleAuthorizationCredential: jest.fn() };
    const revenueCat = { deleteCustomer: jest.fn().mockResolvedValue(undefined) };
    const processor = new ScanAccountCleanupProcessor(outbox as never, auth as never);

    await expect(processor.processBatch()).resolves.toEqual({
      claimed: 1,
      completed: 0,
      retried: 1,
    });
    expect(auth.revokeAppleAuthorizationCredential).not.toHaveBeenCalled();
    expect(outbox.retry).toHaveBeenCalledWith(brokenTask, 'APPLE_REVOCATION_CREDENTIAL_INVALID');
  });

  it('does not process the same lease concurrently', async () => {
    let claimed = false;
    const outbox = {
      claimBatch: jest.fn(async () => {
        if (claimed) return [];
        claimed = true;
        return [task];
      }),
      retry: jest.fn(),
      markAppleRevoked: jest.fn().mockResolvedValue(true),
      markRevenueCatDeleted: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockResolvedValue(true),
      pruneCompleted: jest.fn().mockResolvedValue(0),
    };
    const auth = { revokeAppleAuthorizationCredential: jest.fn() };
    const revenueCat = { deleteCustomer: jest.fn().mockResolvedValue(undefined) };
    const first = new ScanAccountCleanupProcessor(outbox as never, auth as never);
    const second = new ScanAccountCleanupProcessor(outbox as never, auth as never);

    await Promise.all([first.processBatch(), second.processBatch()]);

    expect(revenueCat.deleteCustomer).not.toHaveBeenCalled();
    expect(outbox.complete).toHaveBeenCalledTimes(1);
  });

  it('does not report completion after ownership of the lease was lost', async () => {
    const outbox = {
      claimBatch: jest.fn().mockResolvedValue([task]),
      retry: jest.fn(),
      markAppleRevoked: jest.fn().mockResolvedValue(true),
      markRevenueCatDeleted: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockResolvedValue(false),
      pruneCompleted: jest.fn().mockResolvedValue(0),
    };
    const processor = new ScanAccountCleanupProcessor(
      outbox as never,
      { revokeAppleAuthorizationCredential: jest.fn() } as never,
    );

    await expect(processor.processBatch()).resolves.toEqual({
      claimed: 1,
      completed: 0,
      retried: 0,
    });
    expect(outbox.retry).not.toHaveBeenCalled();
  });

  it('prevents overlapping scheduler ticks while a cleanup pass is running', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cleanup = { processBatch: jest.fn(() => pending) };
    const scheduler = new JobsSchedulerService(
      { process: jest.fn() } as never,
      { process: jest.fn() } as never,
      cleanup as never,
      {
        run: jest.fn().mockResolvedValue({
          expiredBootstrapSessions: 0,
          expiredTerminalMutations: 0,
        }),
      } as never,
    );
    const requestTick = (
      scheduler as unknown as { requestTick: () => Promise<void> }
    ).requestTick.bind(scheduler);

    const first = requestTick();
    await Promise.resolve();
    await requestTick();
    expect(cleanup.processBatch).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('runs sync maintenance once per UTC day, including the first tick after restart', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T15:00:00.000Z'));
    try {
      const cleanup = { processBatch: jest.fn().mockResolvedValue(undefined) };
      const maintenance = {
        run: jest.fn().mockResolvedValue({
          expiredBootstrapSessions: 0,
          expiredTerminalMutations: 0,
        }),
      };
      const scheduler = new JobsSchedulerService(
        { process: jest.fn() } as never,
        { process: jest.fn() } as never,
        cleanup as never,
        maintenance as never,
      );
      const requestTick = (
        scheduler as unknown as { requestTick: () => Promise<void> }
      ).requestTick.bind(scheduler);

      await requestTick();
      await requestTick();

      expect(maintenance.run).toHaveBeenCalledTimes(1);
      expect(maintenance.run).toHaveBeenCalledWith(new Date('2026-08-25T15:00:00.000Z'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses SKIP LOCKED and deterministic jittered backoff without a retry ceiling', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const outbox = new ScanAccountCleanupOutbox(prisma as never);

    await outbox.claimBatch();

    const query = prisma.$queryRaw.mock.calls[0]![0] as { strings: readonly string[] };
    expect(query.strings.join('?')).toContain('FOR UPDATE SKIP LOCKED');
    expect(scanCleanupBackoffMs(1, task.id)).toBe(scanCleanupBackoffMs(1, task.id));
    expect(scanCleanupBackoffMs(1, task.id)).not.toBe(
      scanCleanupBackoffMs(1, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    );
    expect(scanCleanupBackoffMs(1, task.id)).toBeGreaterThanOrEqual(24_000);
    expect(scanCleanupBackoffMs(10_000, task.id)).toBeLessThanOrEqual(6 * 60 * 60 * 1_000);
  });

  it('scrubs the raw subject and encrypted Apple token once Apple and RevenueCat cleanup complete', async () => {
    const prisma = {
      scanAccountCleanupTask: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const outbox = new ScanAccountCleanupOutbox(prisma as never);

    await expect(outbox.complete(task, new Date('2026-08-25T12:00:00.000Z'))).resolves.toBe(true);

    expect(prisma.scanAccountCleanupTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revenueCatDeletedAt: { not: null },
        }),
        data: expect.objectContaining({
          subjectId: null,
          providerSubjectHash: null,
          appleTokenCiphertext: null,
          appleTokenIv: null,
          appleTokenTag: null,
          appleTokenType: null,
          status: 'COMPLETED',
        }),
      }),
    );
  });

  it('keeps the identity fence through RevenueCat deletion after Apple revocation', async () => {
    const prisma = {
      scanAccountCleanupTask: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const outbox = new ScanAccountCleanupOutbox(prisma as never);

    await expect(outbox.markAppleRevoked(task, new Date('2026-08-25T12:00:00.000Z'))).resolves.toBe(
      true,
    );

    expect(prisma.scanAccountCleanupTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          appleRevokedAt: new Date('2026-08-25T12:00:00.000Z'),
          appleTokenCiphertext: null,
          appleTokenIv: null,
          appleTokenTag: null,
          appleTokenType: null,
          appleTokenKeyId: null,
        },
      }),
    );
  });
});
