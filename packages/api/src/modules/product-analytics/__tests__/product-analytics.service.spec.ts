import { ProductAnalyticsService } from '../product-analytics.service';
import { PrismaService } from '../../../prisma';

const mockPrisma = {
  productAnalyticsEvent: {
    deleteMany: jest.fn(),
  },
};

describe('ProductAnalyticsService', () => {
  let service: ProductAnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductAnalyticsService(mockPrisma as unknown as PrismaService);
  });

  describe('deleteEvents', () => {
    it('scopes the delete to the given date range and reports how many rows were removed', async () => {
      mockPrisma.productAnalyticsEvent.deleteMany.mockResolvedValue({ count: 42 });

      const result = await service.deleteEvents('2026-01-01', '2026-01-31');

      expect(mockPrisma.productAnalyticsEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
        },
      });
      expect(result).toEqual({ count: 42 });
    });
  });
});
