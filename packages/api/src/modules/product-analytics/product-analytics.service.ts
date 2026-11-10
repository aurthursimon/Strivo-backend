import { Injectable } from '@nestjs/common';
import { UAParser } from 'ua-parser-js';
import { PrismaService } from '../../prisma';
import { TrackEventsBatchDto } from './dto/track-events.dto';
import type { BreakdownDimension } from './dto/admin-query.dto';

const DEFAULT_RANGE_DAYS = 7;

@Injectable()
export class ProductAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async trackEvents(batch: TrackEventsBatchDto, userAgent: string | undefined, userId: string | null) {
    const { browser, os, device } = UAParser(userAgent ?? '');

    const attribution = {
      utmSource: batch.utmSource,
      utmMedium: batch.utmMedium,
      utmCampaign: batch.utmCampaign,
      utmContent: batch.utmContent,
      utmTerm: batch.utmTerm,
      fbclid: batch.fbclid,
      ttclid: batch.ttclid,
      gclid: batch.gclid,
      country: batch.country,
      ageRange: batch.ageRange,
    };

    const device_ = {
      platform: 'web',
      os: os.name,
      browser: browser.name,
      deviceType: device.type ?? 'desktop',
    };

    await this.prisma.productAnalyticsEvent.createMany({
      data: batch.events.map((event) => ({
        visitorId: batch.visitorId,
        userId,
        eventName: event.eventName,
        stepId: event.stepId,
        stepIndex: event.stepIndex,
        direction: event.direction,
        properties: event.properties as never,
        ...attribution,
        ...device_,
      })),
    });
  }

  async attachVisitorToUser(userId: string, visitorId: string): Promise<void> {
    await this.prisma.productAnalyticsEvent.updateMany({
      where: { visitorId, userId: null },
      data: { userId },
    });
  }

  private resolveRange(from?: string, to?: string) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
    return { fromDate, toDate };
  }

  async getFunnelSummary(from?: string, to?: string) {
    const { fromDate, toDate } = this.resolveRange(from, to);

    const counts = await this.prisma.productAnalyticsEvent.groupBy({
      by: ['eventName'],
      where: { createdAt: { gte: fromDate, lte: toDate } },
      _count: { _all: true },
    });

    const stepViews = await this.prisma.productAnalyticsEvent.groupBy({
      by: ['stepId', 'stepIndex'],
      where: {
        eventName: 'quiz_step_viewed',
        createdAt: { gte: fromDate, lte: toDate },
      },
      _count: { _all: true },
    });

    return {
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      eventCounts: counts
        .map((c) => ({ eventName: c.eventName, count: c._count._all }))
        .sort((a, b) => b.count - a.count),
      quizStepViews: stepViews
        .map((s) => ({ stepId: s.stepId, stepIndex: s.stepIndex, count: s._count._all }))
        .sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0)),
    };
  }

  async getEventsByDay(from?: string, to?: string, eventName?: string) {
    const { fromDate, toDate } = this.resolveRange(from, to);

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; eventName: string; count: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, "eventName", COUNT(*)::bigint AS count
      FROM product_analytics_events
      WHERE "createdAt" >= ${fromDate}
        AND "createdAt" <= ${toDate}
        AND (${eventName ?? null}::text IS NULL OR "eventName" = ${eventName ?? null})
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      eventName: r.eventName,
      count: Number(r.count),
    }));
  }

  async getBreakdown(dimension: BreakdownDimension, from?: string, to?: string) {
    const { fromDate, toDate } = this.resolveRange(from, to);

    const rows = await this.prisma.productAnalyticsEvent.groupBy({
      by: [dimension],
      where: { createdAt: { gte: fromDate, lte: toDate } },
      _count: { _all: true },
    });

    return rows
      .map((r) => ({ value: r[dimension] ?? '(none)', count: r._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  async getRecentEvents(limit: number, eventName?: string) {
    return this.prisma.productAnalyticsEvent.findMany({
      where: eventName ? { eventName } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Admin-only, destructive - lets the product owner clear out test/dev
  // traffic (their own clicks while building the funnel) before real users
  // start generating the numbers that matter. from/to are mandatory on the
  // DTO precisely so this can never silently become "delete everything".
  async deleteEvents(from: string, to: string): Promise<{ count: number }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const result = await this.prisma.productAnalyticsEvent.deleteMany({
      where: { createdAt: { gte: fromDate, lte: toDate } },
    });
    return { count: result.count };
  }
}
