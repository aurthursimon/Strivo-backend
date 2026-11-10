import { Prisma } from '@prisma/client';

export function programDayNumbers(days: unknown): number[] {
  return Array.isArray(days)
    ? [
        ...new Set(
          days.flatMap((day) =>
            day && typeof day === 'object' && Number.isInteger(day.dayNumber) && day.dayNumber > 0
              ? [day.dayNumber as number]
              : [],
          ),
        ),
      ]
    : [];
}
export interface ProgramRankRow {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  completed: number;
  rank: bigint;
  total: bigint;
  joinedAt: Date;
}
export function programRankingQuery(
  programId: string,
  viewer: string,
  days: number[],
  page: number,
) {
  const valid = days.length
    ? Prisma.sql`value IN (${Prisma.join(days.map((day) => Prisma.sql`to_jsonb(${day}::int)`))})`
    : Prisma.sql`FALSE`;
  return Prisma.sql`
    WITH scores AS (
      SELECT e."userId", u.name, u."avatarUrl", e."joinedAt", e."updatedAt",
        (SELECT COUNT(DISTINCT value)::int FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(e."completedDays") = 'array' THEN e."completedDays" ELSE '[]'::jsonb END
        ) WHERE ${valid}) AS completed
      FROM trainer_program_enrollments e JOIN users u ON u.id = e."userId"
      WHERE e."programId" = ${programId} AND e.status IN ('ACTIVE', 'COMPLETED') AND u."deletedAt" IS NULL
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY completed DESC,
        CASE WHEN completed > 0 THEN "updatedAt" END ASC NULLS LAST, "joinedAt" ASC, "userId" ASC) AS rank,
        COUNT(*) OVER () AS total FROM scores
    )
    SELECT "userId", name, "avatarUrl", "joinedAt", completed, rank, total FROM ranked
    WHERE (rank > ${(page - 1) * 30} AND rank <= ${page * 30}) OR "userId" = ${viewer}
    ORDER BY rank`;
}
