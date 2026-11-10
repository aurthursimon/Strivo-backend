import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma';
import type { Env } from '../../../config';
import { TrainingService } from '../training.service';

it('returns a separate exact own position even outside the displayed top 100', async () => {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([
      {
        userId: 'leader',
        name: 'Leader',
        avatarUrl: null,
        progress: 3,
        rank: 1n,
        participantCount: 150n,
        completedAt: new Date(),
      },
      {
        userId: 'me',
        name: 'My name',
        avatarUrl: null,
        progress: 0,
        rank: 150n,
        participantCount: 150n,
        completedAt: null,
      },
    ]),
  };
  const service = new TrainingService(prisma as unknown as PrismaService, {} as Env);
  const result = await service.challengeDetail('me', 'weekly-three');
  expect(result.entries).toHaveLength(1);
  expect(result.myEntry).toMatchObject({ rank: 150, isMe: true, progress: 0 });
  expect(result.challenge.joined).toBe(true);
  expect(result.participantCount).toBe(150);
  expect(() => JSON.stringify(result)).not.toThrow();
});
it('does not invent participants or ranks for an empty challenge', async () => {
  const service = new TrainingService(
    { $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as PrismaService,
    {} as Env,
  );
  const result = await service.challengeDetail('me', 'weekly-three');
  expect(result.entries).toEqual([]);
  expect(result.myEntry).toBeNull();
  expect(result.challenge.joined).toBe(false);
  expect(result.participantCount).toBe(0);
});
it('rejects unknown challenges before querying participant data', async () => {
  const prisma = { $queryRaw: jest.fn() };
  const service = new TrainingService(prisma as unknown as PrismaService, {} as Env);
  await expect(service.challengeDetail('me', 'invented')).rejects.toBeInstanceOf(NotFoundException);
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
});
