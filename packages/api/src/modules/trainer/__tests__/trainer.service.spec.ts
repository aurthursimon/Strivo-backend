import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma';
import { TrainerService } from '../trainer.service';

describe('TrainerService', () => {
  let service: TrainerService;
  let prisma: {
    trainerProfile: any;
    trainerExercise: any;
    trainerProgram: any;
    trainerProgramEnrollment: any;
    user: any;
  };

  beforeEach(async () => {
    prisma = {
      trainerProfile: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      trainerExercise: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      trainerProgram: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      trainerProgramEnrollment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TrainerService>(TrainerService);
  });

  describe('getMyTrainerProfile', () => {
    it('returns existing trainer profile if it exists', async () => {
      const existing = { id: 'tr_1', userId: 'user_1', title: 'Pro Coach' };
      prisma.trainerProfile.findUnique.mockResolvedValue(existing);

      const res = await service.getMyTrainerProfile('user_1');
      expect(res).toEqual(existing);
    });

    it('creates a new profile if none exists for the user', async () => {
      prisma.trainerProfile.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user_2', name: 'Alex Smith', avatarUrl: 'https://avatar.jpg' });
      prisma.trainerProfile.create.mockResolvedValue({
        id: 'tr_2',
        userId: 'user_2',
        title: 'Fitness & Weight Loss Coach',
      });

      const res = await service.getMyTrainerProfile('user_2');
      expect(res.id).toBe('tr_2');
      expect(prisma.trainerProfile.create).toHaveBeenCalled();
    });
  });

  describe('createProgram (Day 1, Day 2 multi-day session)', () => {
    it('creates a structured weight loss program with days and exercises', async () => {
      prisma.trainerProfile.findUnique.mockResolvedValue({ id: 'tr_1', userId: 'user_1' });
      const mockCreated = {
        id: 'prog_1',
        trainerId: 'tr_1',
        title: 'Weight Loss Shred',
        goal: 'WEIGHT_LOSS',
        daysJson: [
          {
            dayNumber: 1,
            title: 'Day 1: Full Body Burn',
            exercises: [{ name: 'Squats', sets: 4, reps: '12' }],
          },
          {
            dayNumber: 2,
            title: 'Day 2: Core Shred',
            exercises: [{ name: '3/4 Sit-Up', sets: 3, reps: '20' }],
          },
        ],
      };
      prisma.trainerProgram.create.mockResolvedValue(mockCreated);

      const res = await service.createProgram('user_1', {
        title: 'Weight Loss Shred',
        goal: 'WEIGHT_LOSS',
        days: [
          {
            dayNumber: 1,
            title: 'Day 1: Full Body Burn',
            exercises: [{ name: 'Squats', sets: 4, reps: '12' }],
          },
          {
            dayNumber: 2,
            title: 'Day 2: Core Shred',
            exercises: [{ name: '3/4 Sit-Up', sets: 3, reps: '20' }],
          },
        ],
      });

      expect(res.id).toBe('prog_1');
      expect(res.daysJson).toHaveLength(2);
    });
  });

  describe('joinProgram (any one can become part of their exercise)', () => {
    it('enrolls athlete and increments trainer trainees count', async () => {
      prisma.trainerProgram.findUnique.mockResolvedValue({
        id: 'prog_1',
        trainerId: 'tr_1',
      });
      prisma.trainerProgramEnrollment.upsert.mockResolvedValue({
        id: 'enr_1',
        programId: 'prog_1',
        userId: 'athlete_1',
        status: 'ACTIVE',
        currentDay: 1,
      });
      prisma.trainerProgramEnrollment.count.mockResolvedValue(15);
      prisma.trainerProfile.update.mockResolvedValue({});

      const enrollment = await service.joinProgram('athlete_1', 'prog_1');
      expect(enrollment.id).toBe('enr_1');
      expect(prisma.trainerProfile.update).toHaveBeenCalledWith({
        where: { id: 'tr_1' },
        data: { traineesCount: 15 },
      });
    });
  });

  describe('completeProgramDay', () => {
    it('adds day to completed days and advances current day', async () => {
      prisma.trainerProgram.findUnique.mockResolvedValue({ daysJson: [{ dayNumber: 1 }, { dayNumber: 2 }] });
      prisma.trainerProgramEnrollment.findUnique.mockResolvedValue({
        id: 'enr_1',
        status: 'ACTIVE',
        completedDays: [1],
        currentDay: 2,
      });
      prisma.trainerProgramEnrollment.update.mockResolvedValue({
        id: 'enr_1',
        completedDays: [1, 2],
        currentDay: 3,
      });

      const res = await service.completeProgramDay('athlete_1', 'prog_1', 2);
      expect(res.completedDays).toEqual([1, 2]);
      expect(res.currentDay).toBe(3);
    });
  });
});
