import { SyncMutationStatus } from '@prisma/client';
import { SYNC_CHANGE_RETENTION_DAYS, SYNC_MUTATION_RETENTION_DAYS } from '../sync.constants';
import { SyncMaintenanceService } from '../sync-maintenance.service';

describe('SyncMaintenanceService', () => {
  it('persiste o floor antes de podar journal e remove apenas mutacoes terminais', async () => {
    const tx = {
      syncBootstrapSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        aggregate: jest.fn().mockResolvedValue({ _min: { snapshotRevision: null } }),
      },
      syncMutation: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      syncChange: {
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: 91n } }),
        deleteMany: jest.fn().mockResolvedValue({ count: 17 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new SyncMaintenanceService(prisma as never);
    const now = new Date('2026-08-25T12:00:00.000Z');

    await expect(service.run(now)).resolves.toEqual({
      expiredBootstrapSessions: 2,
      expiredTerminalMutations: 3,
      prunedJournalChanges: 17,
      retentionFloor: '91',
    });
    expect(tx.syncBootstrapSession.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(tx.syncMutation.deleteMany).toHaveBeenCalledWith({
      where: {
        status: { in: [SyncMutationStatus.APPLIED, SyncMutationStatus.REJECTED] },
        processedAt: {
          lt: new Date(now.getTime() - SYNC_MUTATION_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      },
    });
    expect(tx.syncMutation.deleteMany.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({ status: SyncMutationStatus.PROCESSING }),
    );
    expect(tx.syncChange.aggregate).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date(now.getTime() - SYNC_CHANGE_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      },
      _max: { revision: true },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.syncChange.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date(now.getTime() - SYNC_CHANGE_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
        revision: { lte: 91n },
      },
    });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.syncChange.deleteMany.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('nao move o floor nem executa delete quando nao ha journal expirado', async () => {
    const tx = {
      syncBootstrapSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        aggregate: jest.fn().mockResolvedValue({ _min: { snapshotRevision: null } }),
      },
      syncMutation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      syncChange: {
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: null } }),
        deleteMany: jest.fn(),
      },
      $executeRaw: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await expect(new SyncMaintenanceService(prisma as never).run()).resolves.toEqual(
      expect.objectContaining({ prunedJournalChanges: 0, retentionFloor: null }),
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.syncChange.deleteMany).not.toHaveBeenCalled();
  });

  it('nao avanca o floor alem do snapshot de uma sessao de bootstrap ativa', async () => {
    const tx = {
      syncBootstrapSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        aggregate: jest.fn().mockResolvedValue({ _min: { snapshotRevision: 70n } }),
      },
      syncMutation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      syncChange: {
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: 91n } }),
        deleteMany: jest.fn().mockResolvedValue({ count: 12 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await expect(new SyncMaintenanceService(prisma as never).run()).resolves.toEqual(
      expect.objectContaining({ retentionFloor: '70' }),
    );
    expect(tx.syncChange.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ revision: { lte: 70n } }),
    });
  });
});
