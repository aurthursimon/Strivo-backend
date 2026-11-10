import { Prisma } from '@prisma/client';
import type { TRAINING_CHALLENGES } from './training.catalog';

type Challenge = (typeof TRAINING_CHALLENGES)[number];
export interface ChallengeRankingRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  progress: number;
  rank: bigint;
  participantCount: bigint;
  completedAt: Date | null;
}

/** Aggregate on the server; return at most the top 100 plus the viewer's own row. */
export function challengeRankingQuery(challenge: Challenge, weekStart: Date, viewerId: string) {
  const contribution =
    challenge.metric === 'minutes'
      ? Prisma.sql`w."durationSec"`
      : challenge.metric === 'sets'
        ? Prisma.sql`w."completedSets"`
        : Prisma.sql`1`;
  const scale = challenge.metric === 'minutes' ? 60 : 1;
  const end = new Date(weekStart.getTime() + 7 * 86400000);
  return Prisma.sql`
    WITH members AS (
      SELECT e."userId", e."joinedAt", u."name", u."avatarUrl"
      FROM training_challenge_entries e JOIN users u ON u.id = e."userId"
      WHERE e."challengeId" = ${challenge.id} AND e."weekStart" = ${weekStart} AND u."deletedAt" IS NULL
    ), events AS (
      SELECT m."userId", w."finishedAt", SUM(${contribution}) OVER (
        PARTITION BY m."userId" ORDER BY w."finishedAt", w.id ROWS UNBOUNDED PRECEDING
      ) AS running
      FROM members m JOIN training_workouts w ON w."userId" = m."userId"
      WHERE w."finishedAt" >= m."joinedAt" AND w."finishedAt" >= ${weekStart}
        AND w."finishedAt" < ${end} AND w."completedSets" > 0
    ), totals AS (
      SELECT "userId", MAX(running) AS total FROM events GROUP BY "userId"
    ), scores AS (
      SELECT m."userId", m."name", m."avatarUrl", m."joinedAt",
        LEAST(${challenge.target}, FLOOR(COALESCE(t.total, 0) / ${scale}))::int AS progress,
        MIN(e."finishedAt") FILTER (WHERE e.running >= ${challenge.target * scale}) AS "completedAt",
        MIN(e."finishedAt") FILTER (WHERE FLOOR(COALESCE(t.total, 0) / ${scale}) > 0
          AND e.running >= LEAST(${challenge.target}, FLOOR(COALESCE(t.total, 0) / ${scale})) * ${scale}) AS "progressAt"
      FROM members m LEFT JOIN events e ON e."userId" = m."userId"
      LEFT JOIN totals t ON t."userId" = m."userId"
      GROUP BY m."userId", m."name", m."avatarUrl", m."joinedAt", t.total
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY progress DESC, "progressAt" ASC NULLS LAST, "joinedAt" ASC, "userId" ASC) AS rank,
        COUNT(*) OVER () AS "participantCount"
      FROM scores
    )
    SELECT "userId", "name", "avatarUrl", progress, rank, "participantCount", "completedAt"
    FROM ranked WHERE rank <= 100 OR "userId" = ${viewerId} ORDER BY rank`;
}
