import { Test } from '@nestjs/testing';
import { GamificationService } from '../gamification.service';
import { PrismaService } from '../../../prisma';

const mockPrisma = {
  gamificationProfile: {
    upsert: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  userBadge: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  pointsEvent: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  badge: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('GamificationService', () => {
  let service: GamificationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GamificationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(GamificationService);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('deriva level/xpToNextLevel de points e serializa badges/eventos', async () => {
      mockPrisma.gamificationProfile.upsert.mockResolvedValue({
        userId: 'u1',
        points: 540,
        level: 1,
      });
      mockPrisma.userBadge.findMany.mockResolvedValue([
        {
          unlockedAt: new Date('2026-06-01T00:00:00Z'),
          badge: {
            id: 'b1',
            slug: 'first_steps',
            name: 'Primeiros Passos',
            description: 'x',
            iconUrl: null,
          },
        },
      ]);
      mockPrisma.pointsEvent.findMany.mockResolvedValue([
        {
          eventId: 'e1',
          type: 'MEAL_LOGGED',
          points: 10,
          occurredAt: new Date('2026-06-02T00:00:00Z'),
          meta: null,
        },
      ]);

      const result = await service.getProfile('u1');

      expect(result.points).toBe(540);
      expect(result.level).toBe(2); // floor(540/500)+1
      expect(result.xpToNextLevel).toBe(460); // 500 - (540 % 500)
      expect(result.badges[0]).toMatchObject({ slug: 'first_steps' });
      expect(result.recentEvents[0]).toMatchObject({
        eventId: 'e1',
        type: 'MEAL_LOGGED',
        timestamp: expect.anything(),
      });
      // nao vaza campos internos
      expect(Object.keys(result.badges[0]!)).not.toContain('badgeId');
    });
  });

  describe('recordEvent', () => {
    it('e idempotente: evento existente nao concede pontos novamente', async () => {
      mockPrisma.pointsEvent.findUnique.mockResolvedValue({ id: 'x', eventId: 'e1' });
      mockPrisma.gamificationProfile.upsert.mockResolvedValue({
        userId: 'u1',
        points: 100,
        level: 1,
      });
      mockPrisma.userBadge.findMany.mockResolvedValue([]);
      mockPrisma.pointsEvent.findMany.mockResolvedValue([]);

      await service.recordEvent('u1', { eventId: 'e1', type: 'MEAL_LOGGED' } as never);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('recalcula pontos pelo tipo, ignorando points do cliente', async () => {
      mockPrisma.pointsEvent.findUnique.mockResolvedValue(null);
      mockPrisma.gamificationProfile.upsert.mockResolvedValue({
        userId: 'u1',
        points: 0,
        level: 1,
      });
      const tx = {
        pointsEvent: { create: jest.fn().mockResolvedValue({}) },
        gamificationProfile: {
          update: jest.fn().mockResolvedValue({ userId: 'u1', points: 40, level: 1 }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      mockPrisma.gamificationProfile.findUnique.mockResolvedValue({
        userId: 'u1',
        points: 40,
        level: 1,
      });
      mockPrisma.badge.findMany.mockResolvedValue([]);
      mockPrisma.userBadge.findMany.mockResolvedValue([]);
      mockPrisma.pointsEvent.findMany.mockResolvedValue([]);

      await service.recordEvent('u1', {
        eventId: 'e9',
        type: 'WORKOUT_COMPLETED',
        points: 9999, // advisory, deve ser ignorado
      } as never);

      const createArg = tx.pointsEvent.create.mock.calls[0][0];
      expect(createArg.data.points).toBe(40); // WORKOUT_COMPLETED = 40, nao 9999
      expect(tx.gamificationProfile.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { points: { increment: 40 } },
      });
    });
  });

  describe('getBadges', () => {
    it('retorna catalogo com unlockedAt onde desbloqueado', async () => {
      mockPrisma.badge.findMany.mockResolvedValue([
        { id: 'b1', slug: 'a', name: 'A', description: 'd', iconUrl: null, sortOrder: 1 },
        { id: 'b2', slug: 'b', name: 'B', description: 'd', iconUrl: null, sortOrder: 2 },
      ]);
      mockPrisma.userBadge.findMany.mockResolvedValue([
        { badgeId: 'b1', unlockedAt: new Date('2026-06-01T00:00:00Z') },
      ]);

      const result = await service.getBadges('u1');

      expect(result[0]!.unlockedAt).toBeInstanceOf(Date);
      expect(result[1]!.unlockedAt).toBeUndefined();
    });
  });
});
