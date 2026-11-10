import { Test } from '@nestjs/testing';
import { AchievementsService } from '../achievements.service';
import { PrismaService } from '../../../prisma';

describe('AchievementsService', () => {
  let service: AchievementsService;

  const prismaMock = {
    achievementDefinition: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userAchievement: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    meal: { count: jest.fn() },
    dailyLog: { count: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.achievementDefinition.findUnique.mockResolvedValue({
      id: 'def-1',
      slug: 'first_meal',
    });
    prismaMock.meal.count.mockResolvedValue(1);

    const moduleRef = await Test.createTestingModule({
      providers: [AchievementsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get(AchievementsService);
  });

  it('onMealSaved desbloqueia first_meal quando ha refeicoes', async () => {
    await service.onMealSaved('user-1');

    expect(prismaMock.achievementDefinition.findUnique).toHaveBeenCalledWith({
      where: { slug: 'first_meal' },
    });
    expect(prismaMock.userAchievement.upsert).toHaveBeenCalledWith({
      where: {
        userId_achievementId: { userId: 'user-1', achievementId: 'def-1' },
      },
      create: { userId: 'user-1', achievementId: 'def-1' },
      update: {},
    });
  });
});
