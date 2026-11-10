import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrainerService } from '../trainer.service';
import type { PrismaService } from '../../../prisma';

describe('program participants', () => {
  function setup() {
    const prisma = {
      trainerProgram: {
        findUnique: jest.fn().mockResolvedValue({ daysJson: [{ dayNumber: 1 }, { dayNumber: 2 }] }),
      },
      $queryRaw: jest.fn(),
      trainerProgramEnrollment: { findUnique: jest.fn(), update: jest.fn() },
    };
    return { prisma, service: new TrainerService(prisma as unknown as PrismaService) };
  }
  it('keeps exact own rank outside the current page with safe JSON numbers', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([
      { userId: 'first', name: 'First', rank: 1n, completed: 2, total: 44n },
      { userId: 'me', name: 'Me', rank: 44n, completed: 0, total: 44n },
    ]);
    const result = await service.getProgramParticipants('p', 'me');
    expect(result.entries).toHaveLength(1);
    expect(result.myEntry).toMatchObject({ rank: 44, isMe: true });
    expect(result).toMatchObject({ total: 44, totalDays: 2, nextPage: 2 });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it('rejects unknown programs and invalid pagination before SQL', async () => {
    const { prisma, service } = setup();
    for (const page of [0, -1, 1.5, NaN, Infinity])
      await expect(service.getProgramParticipants('p', 'me', page)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    prisma.trainerProgram.findUnique.mockResolvedValue(null);
    await expect(service.getProgramParticipants('missing', 'me')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('does not change ranking tie time on a repeated completion', async () => {
    const { prisma, service } = setup();
    const enrollment = { status: 'ACTIVE', completedDays: [1] };
    prisma.trainerProgramEnrollment.findUnique.mockResolvedValue(enrollment);
    expect(await service.completeProgramDay('me', 'p', 1)).toBe(enrollment);
    expect(prisma.trainerProgramEnrollment.update).not.toHaveBeenCalled();
    await expect(service.completeProgramDay('me', 'p', 999)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
