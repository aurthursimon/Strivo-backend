import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV_TOKEN, type Env } from '../../config';

export interface MuscleWikiVideo {
  url: string;
  angle: 'front' | 'side' | string;
  gender: 'male' | 'female' | string;
  og_image?: string;
}

export interface MuscleWikiExerciseSummary {
  id: number;
  name: string;
}

export interface MuscleWikiExerciseDetail {
  id: number;
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  tertiary_muscles: string[];
  category: string;
  force: string;
  grips: string[];
  mechanic: string;
  difficulty: string;
  steps: string[];
  videos: MuscleWikiVideo[];
  bodymap_male: string;
  bodymap_female: string;
}

export interface MuscleWikiMuscle {
  name: string;
  count: number;
}

@Injectable()
export class MuscleWikiService {
  private readonly logger = new Logger(MuscleWikiService.name);
  private readonly baseUrl = 'https://api.musclewiki.com';

  private cachedMediaToken: { token: string; expiresAt: number } | null = null;
  private cachedMuscles: { data: MuscleWikiMuscle[]; expiresAt: number } | null = null;
  private readonly exerciseCache = new Map<string, { data: MuscleWikiExerciseDetail; cachedAt: number }>();

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  private get apiKey(): string {
    return (
      this.env.MUSCLEWIKI_API_KEY ||
      process.env.MUSCLEWIKI_API_KEY ||
      'mw_aTHKLr58f19TCn_fuA5GB2xhHOcvVkVAbQuzgrAErM4'
    );
  }

  /**
   * Fetches or reuses a cached 15-minute MuscleWiki JWT media token.
   */
  async getMediaToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedMediaToken && now < this.cachedMediaToken.expiresAt - 60_000) {
      return this.cachedMediaToken.token;
    }

    try {
      const response = await fetch(`${this.baseUrl}/media/token`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Media token request failed with status ${response.status}`);
      }

      const json = (await response.json()) as { token: string; expires_in?: number };
      const expiresInSec = json.expires_in ?? 900;
      this.cachedMediaToken = {
        token: json.token,
        expiresAt: now + expiresInSec * 1000,
      };
      return json.token;
    } catch (err) {
      this.logger.error('Failed to mint MuscleWiki media token', err);
      // Fallback: if we have an older token, try returning it
      if (this.cachedMediaToken) return this.cachedMediaToken.token;
      return '';
    }
  }

  /**
   * Appends media token to MuscleWiki streaming URLs.
   */
  private appendToken(url: string | null | undefined, token: string): string {
    if (!url) return '';
    if (!token) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }

  /**
   * Returns list of muscle groups supported by MuscleWiki.
   */
  async getMuscles(): Promise<MuscleWikiMuscle[]> {
    const now = Date.now();
    if (this.cachedMuscles && now < this.cachedMuscles.expiresAt) {
      return this.cachedMuscles.data;
    }

    try {
      const response = await fetch(`${this.baseUrl}/muscles`, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Muscles request failed with status ${response.status}`);
      }

      const data = (await response.json()) as MuscleWikiMuscle[];
      this.cachedMuscles = {
        data,
        expiresAt: now + 60 * 60 * 1000, // 1 hour cache
      };
      return data;
    } catch (err) {
      this.logger.error('Failed to fetch muscles from MuscleWiki', err);
      return [];
    }
  }

  /**
   * Searches exercises by query string, muscle group, or category.
   */
  async searchExercises(params: {
    search?: string;
    muscle?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    total: number;
    limit: number;
    offset: number;
    count: number;
    results: MuscleWikiExerciseSummary[];
  }> {
    try {
      const url = new URL(`${this.baseUrl}/exercises`);
      if (params.search) url.searchParams.set('search', params.search);
      if (params.muscle) url.searchParams.set('muscles', params.muscle);
      if (params.category) url.searchParams.set('category', params.category);
      if (params.limit) url.searchParams.set('limit', String(params.limit));
      if (params.offset) url.searchParams.set('offset', String(params.offset));

      const response = await fetch(url.toString(), {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Exercise search failed with status ${response.status}`);
      }

      return (await response.json()) as {
        total: number;
        limit: number;
        offset: number;
        count: number;
        results: MuscleWikiExerciseSummary[];
      };
    } catch (err) {
      this.logger.error('Failed to search exercises on MuscleWiki', err);
      return { total: 0, limit: params.limit ?? 20, offset: params.offset ?? 0, count: 0, results: [] };
    }
  }

  /**
   * Resolves exercise details by numeric ID or by exercise name (with fuzzy matching and hydration).
   */
  async getExerciseDetail(nameOrId: string | number): Promise<MuscleWikiExerciseDetail | null> {
    const rawKey = String(nameOrId).trim();
    if (!rawKey) return null;

    // Check memory cache (30 min TTL)
    const cached = this.exerciseCache.get(rawKey.toLowerCase());
    const mediaToken = await this.getMediaToken();

    if (cached && Date.now() - cached.cachedAt < 30 * 60 * 1000) {
      return this.hydrateDetailMedia(cached.data, mediaToken);
    }

    try {
      let exerciseId: number | null = null;

      // If it's a numeric ID
      if (/^\d+$/.test(rawKey)) {
        exerciseId = parseInt(rawKey, 10);
      } else {
        // Search by name
        const cleanName = rawKey
          .replace(/\s*\(.*?\)\s*/g, ' ') // Strip parentheses like (Conventional), (Barbell)
          .replace(/[-_]/g, ' ')
          .trim();

        const searchRes = await this.searchExercises({ search: cleanName, limit: 10 });
        if (searchRes.results && searchRes.results.length > 0) {
          // Look for closest match
          const exact = searchRes.results.find(
            (r) => r.name.toLowerCase() === cleanName.toLowerCase(),
          );
          const first = searchRes.results[0];
          exerciseId = exact ? exact.id : (first ? first.id : null);
        } else {
          // Try searching the first word or main keyword
          const firstWord = cleanName.split(' ')[0];
          if (firstWord && firstWord.length > 2) {
            const fallbackSearch = await this.searchExercises({ search: firstWord, limit: 5 });
            const fallbackFirst = fallbackSearch.results[0];
            if (fallbackFirst) {
              exerciseId = fallbackFirst.id;
            }
          }
        }
      }

      if (!exerciseId) {
        return null;
      }

      const response = await fetch(`${this.baseUrl}/exercises/${exerciseId}`, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Exercise detail fetch failed with status ${response.status}`);
      }

      const rawDetail = (await response.json()) as MuscleWikiExerciseDetail;

      // Cache raw un-tokenized detail
      this.exerciseCache.set(rawKey.toLowerCase(), {
        data: rawDetail,
        cachedAt: Date.now(),
      });
      this.exerciseCache.set(String(rawDetail.id), {
        data: rawDetail,
        cachedAt: Date.now(),
      });
      this.exerciseCache.set(rawDetail.name.toLowerCase(), {
        data: rawDetail,
        cachedAt: Date.now(),
      });

      return this.hydrateDetailMedia(rawDetail, mediaToken);
    } catch (err) {
      this.logger.error(`Failed to get exercise detail for: ${nameOrId}`, err);
      return null;
    }
  }

  /**
   * Clones and attaches streaming media token to bodymap images and video files.
   */
  private hydrateDetailMedia(
    detail: MuscleWikiExerciseDetail,
    token: string,
  ): MuscleWikiExerciseDetail {
    return {
      ...detail,
      bodymap_male: this.appendToken(detail.bodymap_male, token),
      bodymap_female: this.appendToken(detail.bodymap_female, token),
      videos: (detail.videos || []).map((v) => ({
        ...v,
        url: this.appendToken(v.url, token),
        og_image: this.appendToken(v.og_image, token),
      })),
    };
  }
}
