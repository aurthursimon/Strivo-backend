import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'crypto';
import { ENV_TOKEN } from '../../config';
import type { Env } from '../../config';
import { PrismaService } from '../../prisma';

const DEFAULT_READ_WEIGHT = 1;
const DEFAULT_WRITE_WEIGHT = 1;
const MAX_WEIGHT = 1000;

@Injectable()
export class LoadTestService {
  private mixedCounter = 0;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async ping(key: string | undefined) {
    this.assertAllowed(key);
    return {
      ok: true,
      pid: process.pid,
      uptimeMs: Math.round(process.uptime() * 1000),
      timestamp: new Date().toISOString(),
    };
  }

  async db(key: string | undefined) {
    this.assertAllowed(key);
    return this.readLoadTestTable();
  }

  async dbWrite(key: string | undefined) {
    this.assertAllowed(key);
    return this.writeLoadTestTable('write');
  }

  async dbMixed(
    key: string | undefined,
    readsInput: string | undefined,
    writesInput: string | undefined,
  ) {
    this.assertAllowed(key);
    const weights = this.parseWeights(readsInput, writesInput);
    const slot = this.nextMixedSlot(weights.total);

    if (slot < weights.writes) {
      return this.writeLoadTestTable('mixed', weights);
    }

    return this.readLoadTestTable(weights);
  }

  async dbCleanup(key: string | undefined) {
    this.assertAllowed(key);
    const startedAt = process.hrtime.bigint();
    const deleted = await this.prisma.loadTestEvent.deleteMany({});
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    return {
      ok: true,
      db: true,
      operation: 'cleanup',
      deleted: deleted.count,
      latencyMs: Math.round(elapsedMs * 100) / 100,
      timestamp: new Date().toISOString(),
    };
  }

  private async readLoadTestTable(ratio?: { reads: number; writes: number; total: number }) {
    const startedAt = process.hrtime.bigint();
    const latest = await this.prisma.loadTestEvent.findFirst({
      where: { bucket: { in: ['write', 'mixed'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    return {
      ok: true,
      db: true,
      operation: 'read',
      found: Boolean(latest),
      ratio: ratio ? { reads: ratio.reads, writes: ratio.writes } : undefined,
      latencyMs: Math.round(elapsedMs * 100) / 100,
      timestamp: new Date().toISOString(),
    };
  }

  private async writeLoadTestTable(
    bucket: 'write' | 'mixed',
    ratio?: { reads: number; writes: number; total: number },
  ) {
    const startedAt = process.hrtime.bigint();
    await this.prisma.loadTestEvent.create({
      data: {
        bucket,
        payload: randomUUID(),
      },
      select: { id: true },
    });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    return {
      ok: true,
      db: true,
      operation: 'write',
      bucket,
      ratio: ratio ? { reads: ratio.reads, writes: ratio.writes } : undefined,
      latencyMs: Math.round(elapsedMs * 100) / 100,
      timestamp: new Date().toISOString(),
    };
  }

  private parseWeights(readsInput: string | undefined, writesInput: string | undefined) {
    const reads = this.parseWeight(readsInput, DEFAULT_READ_WEIGHT);
    const writes = this.parseWeight(writesInput, DEFAULT_WRITE_WEIGHT);
    if (reads + writes <= 0) {
      return {
        reads: DEFAULT_READ_WEIGHT,
        writes: DEFAULT_WRITE_WEIGHT,
        total: DEFAULT_READ_WEIGHT + DEFAULT_WRITE_WEIGHT,
      };
    }
    return { reads, writes, total: reads + writes };
  }

  private parseWeight(value: string | undefined, fallback: number): number {
    return this.parseBoundedInt(value, fallback, 0, MAX_WEIGHT);
  }

  private parseBoundedInt(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return fallback;
    }

    return parsed;
  }

  private nextMixedSlot(total: number): number {
    if (total <= 0) {
      return 0;
    }

    const slot = this.mixedCounter % total;
    this.mixedCounter = (this.mixedCounter + 1) % Number.MAX_SAFE_INTEGER;
    return slot;
  }

  private assertAllowed(candidate: string | undefined): void {
    if (!this.isValidKey(candidate)) {
      throw new NotFoundException();
    }
  }

  private isValidKey(candidate: string | undefined): boolean {
    const expected = this.env.LOAD_TEST_KEY;
    if (!this.env.ENABLE_LOAD_TEST || !expected || !candidate) {
      return false;
    }

    const actualBuffer = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
