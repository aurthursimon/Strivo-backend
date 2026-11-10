import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PushSyncDto } from '../dto';

const mutation = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  sequence: 1,
  type: 'WATER_ADD',
  entityId: '22222222-2222-4222-8222-222222222222',
  occurredAt: '2026-08-25T12:00:00.000Z',
  payload: { amountMl: 350 },
};

describe('PushSyncDto', () => {
  it('exige installationId UUID v4 no envelope do lote', () => {
    const missing = plainToInstance(PushSyncDto, { mutations: [mutation] });
    const invalid = plainToInstance(PushSyncDto, {
      installationId: 'installation-1',
      mutations: [mutation],
    });
    const valid = plainToInstance(PushSyncDto, {
      installationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      mutations: [mutation],
    });

    expect(validateSync(missing).some((error) => error.property === 'installationId')).toBe(true);
    expect(validateSync(invalid).some((error) => error.property === 'installationId')).toBe(true);
    expect(validateSync(valid)).toHaveLength(0);
  });

  it('exige fuso horario explicito em occurredAt', () => {
    const dto = plainToInstance(PushSyncDto, {
      installationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      mutations: [{ ...mutation, occurredAt: '2026-08-25T12:00:00' }],
    });

    const errors = validateSync(dto);
    const mutationErrors = errors.find((error) => error.property === 'mutations')?.children ?? [];
    expect(
      mutationErrors.some((entry) =>
        (entry.children ?? []).some((child) => child.property === 'occurredAt'),
      ),
    ).toBe(true);
  });
});
