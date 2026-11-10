import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type { FoodSource } from '@prisma/client';

export interface FoodSearchOptions {
  query: string;
  category?: string;
  source?: FoodSource;
  limit?: number;
  offset?: number;
}

const clampInt = (value: number | undefined, fallback: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value as number), min), max);
};

@Injectable()
export class FoodDatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  private normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  async search(options: FoodSearchOptions) {
    const { query, category, source } = options;
    const limit = clampInt(options.limit, 20, 1, 50);
    const offset = clampInt(options.offset, 0, 0, 10_000);
    const normalized = this.normalize(query ?? '');
    if (!normalized) {
      return { items: [], total: 0, limit, offset };
    }

    const where: Record<string, unknown> = {
      nameNormalized: { contains: normalized },
    };

    if (category) where['category'] = category;
    if (source) where['source'] = source;

    const [items, total] = await Promise.all([
      this.prisma.foodItem.findMany({
        where,
        orderBy: [{ timesUsed: 'desc' }, { name: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.foodItem.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async findById(id: string) {
    return this.prisma.foodItem.findUnique({ where: { id } });
  }

  async getCategories() {
    const result = await this.prisma.foodItem.findMany({
      select: { category: true },
      distinct: ['category'],
      where: { category: { not: null } },
      orderBy: { category: 'asc' },
    });
    return result.map((r) => r.category).filter(Boolean);
  }

  async incrementUsage(id: string) {
    return this.prisma.foodItem.update({
      where: { id },
      data: { timesUsed: { increment: 1 } },
    });
  }
}
