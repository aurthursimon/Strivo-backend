import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { NoFoodDetectedError } from '@nutriscan/scan-core';
import { ScanJobStatus } from '@prisma/client';
import { ScanService } from '../scan.service';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const TODAY = '2026-09-28';

function image(): Buffer {
  return Buffer.from('fake-jpeg-bytes');
}

function createHarness(options: { analyzer?: unknown } = {}) {
  const tx = {
    scanUsage: {
      upsert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn().mockResolvedValue({ completed: 0, attempts: 0 }),
    },
    scanJob: {
      count: jest.fn().mockResolvedValue(0),
      upsert: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    scanFeedback: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    },
    scanFeedbackUsage: {
      upsert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ completed: 0, attempts: 0 }]),
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    scanJob: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    scanUsage: {
      findUnique: jest.fn().mockResolvedValue({ completed: 0, attempts: 0 }),
    },
  };
  const access = {
    getScanAccess: jest.fn().mockResolvedValue({ canScan: true, dailyLimit: 5 }),
    consumeFreeScan: jest.fn().mockResolvedValue(true),
    getFreeTierUsage: jest.fn().mockResolvedValue({
      scansUsed: 0,
      scansLimit: 2,
      mealLogsUsed: 0,
      mealLogsLimit: 2,
      doseUsed: false,
      doseMaxMg: 2.5,
    }),
  };
  const analyzer =
    options.analyzer === null
      ? null
      : (options.analyzer ?? {
          analyze: jest.fn().mockResolvedValue({
            result: {
              items: [
                {
                  name: 'Maca',
                  calories: 95,
                  protein_g: 0.5,
                  carbs_g: 25,
                  fat_g: 0.3,
                  fiber_g: 4.4,
                  estimated_portion_g: 180,
                  portion_label: 'g',
                  confidence: 0.9,
                },
              ],
              total_estimated_calories: 95,
              overall_confidence: 0.9,
            },
            provider: 'gemini',
            imageHash: 'hash-1',
          }),
        });

  const service = new ScanService(prisma as never, access as never, analyzer as never);
  return { service, prisma, tx, access, analyzer };
}

describe('ScanService.create', () => {
  it('returns 503 when no AI provider is configured', async () => {
    const { service } = createHarness({ analyzer: null });

    await expect(
      service.create({ userId: 'user-1', idempotencyKey: 'key-1', contentType: 'image/jpeg', image: image(), locale: 'pt' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects with FREE_SCAN_LIMIT_REACHED when access is inactive and no free scan remains', async () => {
    const { service, access } = createHarness();
    access.getScanAccess.mockResolvedValue({ canScan: false, dailyLimit: 0 });
    access.consumeFreeScan.mockResolvedValue(false);

    await expect(
      service.create({ userId: 'user-1', idempotencyKey: 'key-1', contentType: 'image/jpeg', image: image(), locale: 'pt' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FREE_SCAN_LIMIT_REACHED' }) });
  });

  it('rejects with DAILY_SCAN_LIMIT_REACHED when completed + in-flight scans already hit the daily cap', async () => {
    const { service, tx } = createHarness();
    tx.$queryRaw.mockResolvedValue([{ completed: 5, attempts: 3 }]);

    await expect(
      service.create({ userId: 'user-1', idempotencyKey: 'key-1', contentType: 'image/jpeg', image: image(), locale: 'pt' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects with 429 when the defensive daily attempt limit is hit', async () => {
    const { service, tx } = createHarness();
    tx.$queryRaw.mockResolvedValue([{ completed: 0, attempts: 15 }]);

    await expect(
      service.create({ userId: 'user-1', idempotencyKey: 'key-1', contentType: 'image/jpeg', image: image(), locale: 'pt' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('claims, analyzes, and completes a fresh scan', async () => {
    const { service, tx } = createHarness();
    tx.scanJob.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({ ...create, createdAt: NOW, updatedAt: NOW }),
    );
    tx.scanJob.findFirst.mockImplementation(() =>
      Promise.resolve({
        id: 'job-1',
        userId: 'user-1',
        status: ScanJobStatus.PROCESSING,
        leaseToken: 'lease-1',
        quotaDay: TODAY,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    tx.scanJob.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'job-1',
        userId: 'user-1',
        status: data.status,
        result: data.result,
        provider: data.provider,
        imageHash: data.imageHash,
        errorCode: null,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );

    const result = await service.create({
      userId: 'user-1',
      idempotencyKey: 'key-1',
      contentType: 'image/jpeg',
      image: image(),
      locale: 'pt',
    });

    expect(result.status).toBe(ScanJobStatus.COMPLETED);
    expect(result.items?.[0]).toMatchObject({ name: 'Maca', calories: 95 });
    expect(result.totalCalories).toBe(95);
    expect(tx.scanUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { completed: { increment: 1 } } }),
    );
  });

  it('marks the job FAILED_FINAL with a mapped error code when the analyzer finds no food', async () => {
    const analyzer = { analyze: jest.fn().mockRejectedValue(new NoFoodDetectedError()) };
    const { service, tx, prisma } = createHarness({ analyzer });
    tx.scanJob.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({ ...create, createdAt: NOW, updatedAt: NOW }),
    );
    (prisma.scanJob as unknown as { updateMany: jest.Mock }).updateMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    prisma.scanJob.findFirst = jest.fn().mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: ScanJobStatus.FAILED_FINAL,
      errorCode: 'NO_FOOD_DETECTED',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await service.create({
      userId: 'user-1',
      idempotencyKey: 'key-1',
      contentType: 'image/jpeg',
      image: image(),
      locale: 'pt',
    });

    expect(result.status).toBe(ScanJobStatus.FAILED_FINAL);
    expect(result.error).toMatchObject({ code: 'NO_FOOD_DETECTED' });
  });

  it('replays an already-completed job for a retried idempotency key without re-analyzing', async () => {
    const { service, prisma, analyzer } = createHarness();
    prisma.scanJob.findUnique.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      contentSha256: createHash('sha256').update(image()).digest('hex'),
      status: ScanJobStatus.COMPLETED,
      result: {
        items: [
          {
            name: 'Maca',
            calories: 95,
            protein_g: 0.5,
            carbs_g: 25,
            fat_g: 0.3,
            fiber_g: 4.4,
            estimated_portion_g: 180,
            portion_label: 'g',
            confidence: 0.9,
          },
        ],
        total_estimated_calories: 95,
        overall_confidence: 0.9,
      },
      provider: 'gemini',
      imageHash: 'hash-1',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await service.create({
      userId: 'user-1',
      idempotencyKey: 'key-1',
      contentType: 'image/jpeg',
      image: image(),
      locale: 'pt',
    });

    expect(result.status).toBe(ScanJobStatus.COMPLETED);
    expect((analyzer as { analyze: jest.Mock }).analyze).not.toHaveBeenCalled();
  });

  it('rejects a retried idempotency key whose content changed', async () => {
    const { service, prisma } = createHarness();
    prisma.scanJob.findUnique.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      contentSha256: 'different-hash',
      status: ScanJobStatus.COMPLETED,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      service.create({ userId: 'user-1', idempotencyKey: 'key-1', contentType: 'image/jpeg', image: image(), locale: 'pt' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ScanService.feedback', () => {
  function completedJob(overrides: Record<string, unknown> = {}) {
    return {
      id: 'job-1',
      userId: 'user-1',
      status: ScanJobStatus.COMPLETED,
      result: {
        items: [
          {
            name: 'Maca',
            calories: 95,
            protein_g: 0.5,
            carbs_g: 25,
            fat_g: 0.3,
            fiber_g: 4.4,
            estimated_portion_g: 180,
            portion_label: 'g',
            confidence: 0.9,
          },
        ],
        total_estimated_calories: 95,
        overall_confidence: 0.9,
      },
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  it('rejects feedback for a scan that has not completed', async () => {
    const { service, prisma } = createHarness();
    prisma.scanJob.findFirst = jest.fn().mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      status: ScanJobStatus.PROCESSING,
      result: null,
    });

    await expect(
      service.feedback('user-1', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', {
        edited: true,
        savedItems: [{ name: 'Maca', portionG: 200 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts new feedback and records usage', async () => {
    const { service, tx, prisma } = createHarness();
    prisma.scanJob.findFirst = jest.fn().mockResolvedValue(completedJob());
    tx.$queryRaw.mockResolvedValue([{ acceptedCount: 0, lastAcceptedAt: null }]);

    const result = await service.feedback('user-1', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', {
      edited: true,
      savedItems: [{ name: 'Maca', portionG: 200 }],
    });

    expect(result).toEqual({ accepted: true });
    expect(tx.scanFeedback.create).toHaveBeenCalledTimes(1);
    expect(tx.scanFeedbackUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acceptedCount: { increment: 1 } }) }),
    );
  });

  it('treats a byte-identical resubmission as a no-op duplicate', async () => {
    const { service, tx, prisma } = createHarness();
    prisma.scanJob.findFirst = jest.fn().mockResolvedValue(completedJob());
    tx.scanFeedback.findUnique.mockResolvedValue({
      userId: 'user-1',
      payloadHash: createHash('sha256')
        .update(Buffer.from(JSON.stringify({ edited: true, savedItems: [{ name: 'Maca', portionG: 200 }] })))
        .digest('hex'),
    });

    const result = await service.feedback('user-1', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', {
      edited: true,
      savedItems: [{ name: 'Maca', portionG: 200 }],
    });

    expect(result).toEqual({ accepted: true });
    expect(tx.scanFeedback.create).not.toHaveBeenCalled();
  });

  it('rejects a resubmission under the same scan id with different content', async () => {
    const { service, tx, prisma } = createHarness();
    prisma.scanJob.findFirst = jest.fn().mockResolvedValue(completedJob());
    tx.scanFeedback.findUnique.mockResolvedValue({ userId: 'user-1', payloadHash: 'stale-hash' });

    await expect(
      service.feedback('user-1', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', {
        edited: true,
        savedItems: [{ name: 'Maca', portionG: 200 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ScanService.getAccess', () => {
  it('combines entitlement, usage, and free-tier state', async () => {
    const { service, prisma, access } = createHarness();
    prisma.scanUsage.findUnique.mockResolvedValue({ completed: 2, attempts: 3 });
    prisma.scanJob.count.mockResolvedValue(1);
    access.getScanAccess.mockResolvedValue({ canScan: true, dailyLimit: 5 });

    const result = await service.getAccess('user-1');

    expect(result).toMatchObject({
      canScan: true,
      dailyLimit: 5,
      usedToday: 2,
      attemptsToday: 3,
      reservedToday: 1,
      remainingToday: 2,
      freeScansRemaining: 2,
    });
  });

  it('falls back to the lifetime free-scan allowance when there is no active entitlement', async () => {
    const { service, prisma, access } = createHarness();
    prisma.scanUsage.findUnique.mockResolvedValue(null);
    access.getScanAccess.mockResolvedValue({ canScan: false, dailyLimit: 0 });
    access.getFreeTierUsage.mockResolvedValue({
      scansUsed: 2,
      scansLimit: 2,
      mealLogsUsed: 0,
      mealLogsLimit: 2,
      doseUsed: false,
      doseMaxMg: 2.5,
    });

    const result = await service.getAccess('user-1');

    expect(result.canScan).toBe(false);
    expect(result.freeScansRemaining).toBe(0);
    expect(result.source).toBe('free_tier');
  });
});
