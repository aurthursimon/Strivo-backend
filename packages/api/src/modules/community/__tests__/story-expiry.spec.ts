import { NotFoundException } from '@nestjs/common';
import { CommunityService } from '../community.service';
import type { PrismaService } from '../../../prisma';

describe('story expiry', () => {
  it('expires legacy stories and returns only active real stories without reseeding', async () => {
    const prisma = {
      communityStory: {
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
      },
    };
    const service = new CommunityService(prisma as unknown as PrismaService);
    await expect(service.listStories('viewer')).resolves.toEqual([]);
    const update = prisma.communityStory.updateMany.mock.calls[0][0];
    expect(update.where.createdAt.lte.getTime()).toBe(update.data.expiresAt.getTime() - 86400000);
    expect(prisma.communityStory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: { gt: update.data.expiresAt },
          createdAt: { gt: update.where.createdAt.lte },
          user: expect.objectContaining({ deletedAt: null }),
        }),
      }),
    );
    expect(prisma.communityStory.count).not.toHaveBeenCalled();
  });
  it('rejects views and likes for expired stories', async () => {
    const prisma = { communityStory: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new CommunityService(prisma as unknown as PrismaService);
    await expect(service.viewStory('viewer', 'expired')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.likeStory('viewer', 'expired')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.communityStory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: expect.any(Object),
          createdAt: expect.any(Object),
        }),
      }),
    );
  });
});
