import { Prisma, type SyncChange } from '@prisma/client';
import type { SyncChangeDraft } from './sync.types';

type JournalClient = Pick<Prisma.TransactionClient, 'syncChange'>;

export interface AppendSyncChangeOptions {
  mutationId?: string;
  occurredAt?: Date;
}

export async function appendSyncChange(
  tx: JournalClient,
  userId: string,
  draft: SyncChangeDraft,
  options: AppendSyncChangeOptions = {},
): Promise<SyncChange> {
  return tx.syncChange.create({
    data: {
      userId,
      entityType: draft.entityType,
      entityId: draft.entityId,
      action: draft.action,
      version: draft.version,
      dataJson:
        draft.data === null ? Prisma.DbNull : (draft.data as unknown as Prisma.InputJsonObject),
      mutationId: options.mutationId,
      occurredAt: options.occurredAt ?? new Date(),
    },
  });
}

export function deleteSyncDraft(
  entityType: string,
  entityId: string,
  version?: number,
): SyncChangeDraft {
  return {
    entityType,
    entityId,
    action: 'DELETE',
    version,
    data: null,
  };
}
