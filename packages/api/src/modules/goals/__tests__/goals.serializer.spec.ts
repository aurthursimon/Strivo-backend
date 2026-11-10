import { Test } from '@nestjs/testing';
import { GoalsService } from '../goals.service';
import { PrismaService } from '../../../prisma';
import type { CreateGoalDto } from '../dto/create-goal.dto';

const mockPrisma = {
  $transaction: jest.fn(),
  goal: {
    create: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

describe('GoalsService (shape app <-> DB)', () => {
  let service: GoalsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GoalsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GoalsService>(GoalsService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
    );
    mockPrisma.user.findUnique.mockResolvedValue({ dietType: 'OMNIVORE' });
  });

  describe('create', () => {
    it('desativa metas anteriores e mapeia app->DB; retorna shape app', async () => {
      mockPrisma.goal.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.goal.create.mockResolvedValue({
        id: 'g1',
        dailyCalories: 2100,
        dailyProteinG: 160,
        dailyCarbsG: 210,
        dailyFatG: 60,
        dailyFiberG: 29,
        waterMl: 2500,
        type: 'LOSE_WEIGHT',
        goalSpeed: 'MODERATE',
        targetWeightKg: 72,
        weeklyGoalKg: 0.5,
        calculationInputJson: { weightKg: 80 },
        startDate: new Date('2026-01-01'),
        targetDate: new Date('2026-06-01'),
        createdAt: new Date('2026-01-01'),
      });

      // DTO ja normalizado (type longo, goalSpeed UPPER pelo @Transform).
      const dto = {
        type: 'LOSE_WEIGHT',
        goalSpeed: 'MODERATE',
        targetWeightKg: 72,
        calories: 2100,
        protein: 160,
        carbs: 210,
        fat: 60,
        waterMl: 2500,
      } as unknown as CreateGoalDto;

      const result = await service.create('user-1', dto);

      // desativa anteriores ANTES de criar
      expect(mockPrisma.goal.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true },
        data: { isActive: false },
      });

      const createData = mockPrisma.goal.create.mock.calls[0][0].data;
      expect(createData).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          dailyCalories: 2100,
          dailyProteinG: 160,
          dailyCarbsG: 210,
          dailyFatG: 60,
          dailyFiberG: 29,
          waterMl: 2500,
          type: 'LOSE_WEIGHT',
          goalSpeed: 'MODERATE',
          targetWeightKg: 72,
        }),
      );
      // nomes app nao vazam crus para o Prisma
      expect(createData).not.toHaveProperty('calories');
      expect(createData).not.toHaveProperty('protein');

      // saida em shape app
      expect(result).toEqual({
        id: 'g1',
        calories: 2100,
        protein: 160,
        carbs: 210,
        fat: 60,
        fiberG: 29,
        waterMl: 2500,
        type: 'LOSE',
        goalSpeed: 'moderate',
        targetWeightKg: 72,
        weeklyGoalKg: 0.5,
        startWeightKg: 80,
        startDate: new Date('2026-01-01'),
        targetDate: new Date('2026-06-01'),
        createdAt: new Date('2026-01-01'),
      });
    });

    it('preserva a meta de fibra zero para usuario carnivoro', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ dietType: 'CARNIVORE' });
      mockPrisma.goal.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.goal.create.mockImplementation(({ data }) => ({
        id: 'g-carnivore',
        ...data,
      }));

      await service.create('user-carnivore', { type: 'MAINTAIN', calories: 2000 } as CreateGoalDto);

      expect(mockPrisma.goal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ dailyFiberG: 0 }),
      });
    });
  });

  describe('findActive', () => {
    it('serializa a meta ativa para shape app', async () => {
      mockPrisma.goal.findFirst.mockResolvedValue({
        id: 'g1',
        dailyCalories: 1800,
        dailyProteinG: 140,
        dailyFiberG: 25,
        type: 'MAINTAIN',
        goalSpeed: null,
      });

      const result = await service.findActive('user-1');

      expect(result.calories).toBe(1800);
      expect(result.protein).toBe(140);
      expect(result.fiberG).toBe(25);
      expect(result.type).toBe('MAINTAIN');
      expect(result.goalSpeed).toBeNull();
    });

    it('lanca NotFound quando nao ha meta ativa', async () => {
      mockPrisma.goal.findFirst.mockResolvedValue(null);
      await expect(service.findActive('user-1')).rejects.toThrow('Nenhuma meta ativa');
    });
  });

  describe('update', () => {
    it('mapeia Partial app->DB sem spread cru; ignora campos ausentes; serializa', async () => {
      mockPrisma.goal.findFirst.mockResolvedValue({ id: 'g1' });
      mockPrisma.goal.update.mockResolvedValue({
        id: 'g1',
        dailyCalories: 2200,
        type: 'GAIN_WEIGHT',
        goalSpeed: 'FAST',
      });

      const dto = { calories: 2200, goalSpeed: 'FAST' } as unknown as Partial<CreateGoalDto>;
      const result = await service.update('user-1', 'g1', dto);

      const updateData = mockPrisma.goal.update.mock.calls[0][0].data;
      expect(updateData.dailyCalories).toBe(2200);
      expect(updateData.goalSpeed).toBe('FAST');
      // campos ausentes -> undefined (Prisma ignora)
      expect(updateData.dailyProteinG).toBeUndefined();
      // nomes app nao vazam crus
      expect(updateData).not.toHaveProperty('calories');

      expect(result.type).toBe('GAIN');
      expect(result.goalSpeed).toBe('fast');
    });

    it('lanca NotFound quando a meta nao existe', async () => {
      mockPrisma.goal.findFirst.mockResolvedValue(null);
      await expect(
        service.update('user-1', 'missing', {} as Partial<CreateGoalDto>),
      ).rejects.toThrow('Meta nao encontrada');
    });
  });
});
