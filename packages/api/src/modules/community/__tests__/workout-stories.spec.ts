import { BadRequestException } from '@nestjs/common';
import { CommunityService } from '../community.service';
import type { PrismaService } from '../../../prisma';

describe('workout status stories', () => {
  function setup() {
    const prisma = {
      communityStory: {
        create: jest.fn().mockResolvedValue({ id: 'story' }),
        upsert: jest.fn().mockResolvedValue({ id: 'story' }),
        findUnique: jest.fn(),
      },
    };
    return { prisma, service: new CommunityService(prisma as unknown as PrismaService) };
  }
  it('publishes text statuses under the authenticated owner and expires them after 24h', async () => {
    const { prisma, service } = setup();
    const before = Date.now();
    await service.createStory('owner-a', {
      mediaUrl: 'text:workout',
      mediaType: 'TEXT',
      caption: 'Workout finished',
    });
    const { data } = prisma.communityStory.create.mock.calls[0][0];
    expect(data).toMatchObject({
      userId: 'owner-a',
      mediaType: 'TEXT',
      caption: 'Workout finished',
    });
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 86400000);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 86400000);
  });
  it('rejects device-local video paths, oversized media and empty text', async () => {
    const { prisma, service } = setup();
    await expect(
      service.createStory('a', { mediaUrl: 'file:///private/video.mp4', mediaType: 'VIDEO' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createStory('a', { mediaUrl: 'text:workout', mediaType: 'TEXT', caption: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createStory('a', {
        mediaUrl: 'data:video/mp4;base64,' + 'a'.repeat(8000001),
        mediaType: 'VIDEO',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.communityStory.create).not.toHaveBeenCalled();
  });
  it('requires video for a workout status while leaving ordinary text stories supported', async () => {
    const { prisma, service } = setup();
    await expect(service.createStory('a', { mediaUrl: 'text:workout', mediaType: 'TEXT', caption: 'Finished', workoutStatus: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.communityStory.create).not.toHaveBeenCalled();
    await expect(service.createStory('a', { mediaUrl: 'data:video/mp4;base64,YQ==', mediaType: 'VIDEO', caption: 'Finished', workoutStatus: true })).resolves.toHaveProperty('id');
  });
  it('deduplicates publication retries with an owner-bound request id', async () => {
    const { prisma, service } = setup();
    await service.createStory('owner-a', {
      mediaUrl: 'text:workout',
      mediaType: 'TEXT',
      caption: 'Finished!',
      clientRequestId: 'request-1',
    });
    expect(prisma.communityStory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clientRequestId: { userId: 'owner-a', clientRequestId: 'request-1' } },
        update: {},
        create: expect.objectContaining({ userId: 'owner-a' }),
      }),
    );
  });
});
