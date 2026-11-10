import { hashSyncMutation } from '../sync-hash';
import type { SyncMutationDto } from '../dto';

const baseMutation: SyncMutationDto = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  sequence: 1,
  type: 'WATER_ADD',
  entityId: '22222222-2222-4222-8222-222222222222',
  occurredAt: '2026-08-25T12:00:00.000Z',
  payload: { amountMl: 350, metadata: { source: 'quick-add', order: 1 } },
};

describe('hashSyncMutation', () => {
  it('produz o mesmo SHA-256 para objetos semanticamente iguais', () => {
    const reordered: SyncMutationDto = {
      ...baseMutation,
      payload: { metadata: { order: 1, source: 'quick-add' }, amountMl: 350 },
    };

    expect(hashSyncMutation(reordered)).toBe(hashSyncMutation(baseMutation));
    expect(hashSyncMutation(baseMutation)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('muda quando o conteudo da mutacao muda', () => {
    expect(hashSyncMutation({ ...baseMutation, payload: { amountMl: 500 } })).not.toBe(
      hashSyncMutation(baseMutation),
    );
  });
});
