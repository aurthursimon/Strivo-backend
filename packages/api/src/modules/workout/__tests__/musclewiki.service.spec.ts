import { MuscleWikiService } from '../musclewiki.service';
import type { Env } from '../../../config';

describe('MuscleWikiService', () => {
  let service: MuscleWikiService;
  const mockEnv = {
    MUSCLEWIKI_API_KEY: 'test-key',
  } as Env;

  beforeEach(() => {
    service = new MuscleWikiService(mockEnv);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should mint and cache a media token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'mock-token-abc', expires_in: 900 }),
    } as Response);

    const token1 = await service.getMediaToken();
    expect(token1).toBe('mock-token-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call should return cached token without fetching again
    const token2 = await service.getMediaToken();
    expect(token2).toBe('mock-token-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should search exercises with query params', async () => {
    const mockResult = {
      total: 1,
      limit: 10,
      offset: 0,
      count: 1,
      results: [{ id: 4, name: 'Barbell Bench Press' }],
    };

    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response);

    const res = await service.searchExercises({ search: 'bench', limit: 10 });
    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.name).toBe('Barbell Bench Press');
  });

  it('should fetch exercise detail by id and hydrate media URLs with token', async () => {
    // 1st fetch: token
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'media-jwt-123', expires_in: 900 }),
      } as Response)
      // 2nd fetch: exercise 4 detail
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 4,
          name: 'Barbell Bench Press',
          primary_muscles: ['Chest'],
          secondary_muscles: ['Triceps'],
          tertiary_muscles: ['Shoulders'],
          category: 'Barbell',
          force: 'Push',
          grips: ['Overhand'],
          mechanic: 'Compound',
          difficulty: 'Intermediate',
          steps: ['Step 1', 'Step 2'],
          videos: [
            {
              url: 'https://api.musclewiki.com/stream/videos/bench-front.mp4',
              angle: 'front',
              gender: 'male',
              og_image: 'https://api.musclewiki.com/stream/images/bench-front.jpg',
            },
          ],
          bodymap_male: 'https://api.musclewiki.com/stream/images/bodymaps/4?gender=male',
          bodymap_female: 'https://api.musclewiki.com/stream/images/bodymaps/4?gender=female',
        }),
      } as Response);

    const detail = await service.getExerciseDetail(4);
    expect(detail).not.toBeNull();
    expect(detail?.name).toBe('Barbell Bench Press');
    expect(detail?.bodymap_male).toContain('token=media-jwt-123');
    expect(detail?.bodymap_female).toContain('token=media-jwt-123');
    expect(detail?.videos[0]?.url).toContain('token=media-jwt-123');
    expect(detail?.videos[0]?.og_image).toContain('token=media-jwt-123');
  });
});
