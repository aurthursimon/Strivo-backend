import { NotFoundException } from '@nestjs/common';
import { LoadTestService } from './load-test.service';

const key = 'load-test-key-with-at-least-32-chars';

describe('LoadTestService', () => {
  const prismaMock = () => ({
    loadTestEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'load-test-event-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });

  it('retorna 404 quando load test esta desligado', async () => {
    const prisma = prismaMock();
    const service = new LoadTestService(
      { ENABLE_LOAD_TEST: false, LOAD_TEST_KEY: key } as never,
      prisma as never,
    );

    await expect(service.ping(key)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retorna 404 quando a chave esta errada', async () => {
    const prisma = prismaMock();
    const service = new LoadTestService(
      { ENABLE_LOAD_TEST: true, LOAD_TEST_KEY: key } as never,
      prisma as never,
    );

    await expect(service.ping('wrong-key')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde ping quando habilitado e com chave correta', async () => {
    const prisma = prismaMock();
    const service = new LoadTestService(
      { ENABLE_LOAD_TEST: true, LOAD_TEST_KEY: key } as never,
      prisma as never,
    );

    await expect(service.ping(key)).resolves.toMatchObject({ ok: true });
    expect(prisma.loadTestEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.loadTestEvent.create).not.toHaveBeenCalled();
  });

  it('executa query simples no endpoint db', async () => {
    const prisma = prismaMock();
    const service = new LoadTestService(
      { ENABLE_LOAD_TEST: true, LOAD_TEST_KEY: key } as never,
      prisma as never,
    );

    await expect(service.db(key)).resolves.toMatchObject({ ok: true, db: true, operation: 'read' });
    expect(prisma.loadTestEvent.findFirst).toHaveBeenCalledTimes(1);
  });

  it('executa escrita isolada no endpoint db-write', async () => {
    const prisma = prismaMock();
    const service = new LoadTestService(
      { ENABLE_LOAD_TEST: true, LOAD_TEST_KEY: key } as never,
      prisma as never,
    );

    await expect(service.dbWrite(key)).resolves.toMatchObject({
      ok: true,
      db: true,
      operation: 'write',
      bucket: 'write',
    });
    expect(prisma.loadTestEvent.create).toHaveBeenCalledTimes(1);
  });

  it('alterna leitura e escrita no endpoint db-mixed com proporcao configuravel N:N', async () => {
    const prisma = prismaMock();
    const service = new LoadTestService(
      { ENABLE_LOAD_TEST: true, LOAD_TEST_KEY: key } as never,
      prisma as never,
    );

    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await service.dbMixed(key, '3', '2'));
    }

    expect(results.filter((result) => result.operation === 'write')).toHaveLength(2);
    expect(results.filter((result) => result.operation === 'read')).toHaveLength(3);
    expect(results.every((result) => result.ratio?.reads === 3 && result.ratio?.writes === 2)).toBe(
      true,
    );
    expect(prisma.loadTestEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.loadTestEvent.findFirst).toHaveBeenCalledTimes(3);
  });

  it('limpa os eventos de load test', async () => {
    const prisma = prismaMock();
    prisma.loadTestEvent.deleteMany.mockResolvedValueOnce({ count: 123 });
    const service = new LoadTestService(
      { ENABLE_LOAD_TEST: true, LOAD_TEST_KEY: key } as never,
      prisma as never,
    );

    await expect(service.dbCleanup(key)).resolves.toMatchObject({
      ok: true,
      db: true,
      operation: 'cleanup',
      deleted: 123,
    });
    expect(prisma.loadTestEvent.deleteMany).toHaveBeenCalledTimes(1);
  });
});
