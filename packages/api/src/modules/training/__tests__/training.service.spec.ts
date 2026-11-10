import { BadRequestException } from '@nestjs/common';
import type { Env } from '../../../config';
import type { PrismaService } from '../../../prisma';
import { trainingWeek } from '../training.catalog';
import { TrainingService } from '../training.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CoachDto, VoiceDto } from '../training.dto';

function setup() {
  const prisma = {
    trainingWorkout: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    trainingChallengeEntry: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new TrainingService(prisma as unknown as PrismaService, {} as Env) };
}
describe('training social features', () => {
  it('uses a consistent Monday UTC week even on Sunday and across years', () => {
    expect(trainingWeek(new Date('2026-11-08T23:59:59Z')).toISOString()).toBe(
      '2026-11-02T00:00:00.000Z',
    );
    expect(trainingWeek(new Date('2027-01-01T12:00:00Z')).toISOString()).toBe(
      '2026-12-28T00:00:00.000Z',
    );
  });
  it('deduplicates completion per owner and leaves existing scores immutable on retries', async () => {
    const { prisma, service } = setup();
    const dto = {
      workoutId: 'workout-1',
      title: 'Workout',
      startedAt: '2026-01-01T10:00:00Z',
      finishedAt: '2026-01-01T10:30:00Z',
      durationSec: 1800,
      completedSets: 5,
    };
    await service.finish('owner-a', dto);
    expect(prisma.trainingWorkout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_workoutId: { userId: 'owner-a', workoutId: 'workout-1' } },
        update: {},
        create: expect.objectContaining({ userId: 'owner-a', completedSets: 5 }),
      }),
    );
  });
  it('rejects impossible durations and reversed timestamps before writing', async () => {
    const { prisma, service } = setup();
    await expect(
      service.finish('a', {
        workoutId: '1',
        title: 'x',
        startedAt: '2026-01-01T10:00:00Z',
        finishedAt: '2026-01-01T10:00:01Z',
        durationSec: 1000,
        completedSets: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.trainingWorkout.upsert).not.toHaveBeenCalled();
  });
  it('counts only workouts finished after joining, and caps challenge progress', async () => {
    const { prisma, service } = setup();
    const joinedAt = new Date();
    prisma.trainingChallengeEntry.findMany.mockResolvedValue([
      { challengeId: 'first-session', joinedAt },
    ]);
    prisma.trainingWorkout.findMany.mockResolvedValue([
      { finishedAt: new Date(joinedAt.getTime() - 1000), durationSec: 600, completedSets: 10 },
      { finishedAt: new Date(joinedAt.getTime() + 1000), durationSec: 600, completedSets: 10 },
      { finishedAt: new Date(joinedAt.getTime() + 2000), durationSec: 600, completedSets: 10 },
    ]);
    const challenges = await service.challenges('owner-a');
    expect(challenges.find((item) => item.id === 'first-session')).toEqual(
      expect.objectContaining({ joined: true, progress: 1 }),
    );
    expect(challenges.find((item) => item.id === 'weekly-three')).toEqual(
      expect.objectContaining({ joined: false, progress: 0 }),
    );
    expect(prisma.trainingWorkout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'owner-a', completedSets: { gt: 0 } }),
      }),
    );
  });
  it('rejects invented challenges and scopes repeated joins by owner and week', async () => {
    const { prisma, service } = setup();
    await expect(service.join('a', 'invented')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.trainingChallengeEntry.upsert).not.toHaveBeenCalled();
    await service.join('a', 'weekly-three');
    expect(prisma.trainingChallengeEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_challengeId_weekStart: {
            userId: 'a',
            challengeId: 'weekly-three',
            weekStart: trainingWeek(),
          },
        },
        update: {},
      }),
    );
  });
  it('returns an empty real-user leaderboard without fabricating demo athletes', async () => {
    const { service } = setup();
    expect((await service.leaderboard('a')).entries).toEqual([]);
  });
  it('marks the real current athlete and exposes no email or health profile', async () => {
    const { prisma, service } = setup();
    prisma.trainingWorkout.groupBy.mockResolvedValue([
      { userId: 'a', _count: { _all: 3 }, _sum: { durationSec: 3600 } },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'a', name: 'Athlete A', avatarUrl: null }]);
    expect((await service.leaderboard('a')).entries).toEqual([
      {
        rank: 1,
        userId: 'a',
        name: 'Athlete A',
        avatarUrl: null,
        workouts: 3,
        minutes: 60,
        isMe: true,
      },
    ]);
  });
  it('rejects oversized or malformed audio and excessive AI history', async () => {
    expect(
      (
        await validate(
          plainToInstance(VoiceDto, { audio: 'not base64!', mimeType: 'application/javascript' }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(CoachDto, {
            messages: Array.from({ length: 13 }, () => ({ role: 'user', text: 'hello' })),
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
