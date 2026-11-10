import { PrismaClient } from '@prisma/client';
import { challengeRankingQuery } from '../challenge-ranking';

// Opt-in: use an isolated local database; all fixtures live in temporary tables.
const connection = process.env.CHALLENGE_TEST_DATABASE_URL;
const databaseTests = connection ? describe : describe.skip;
databaseTests('challenge ranking SQL', () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    if (!connection || !['127.0.0.1', 'localhost'].includes(new URL(connection).hostname))
      throw new Error('A local test database is required');
    prisma = new PrismaClient({ datasources: { db: { url: connection } } });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  it('ranks capped progress, handles ties and includes the viewer beyond the top 100', async () => {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE users (id text PRIMARY KEY, name text, "avatarUrl" text, "deletedAt" timestamp) ON COMMIT DROP',
        );
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE training_challenge_entries ("userId" text, "challengeId" text, "weekStart" timestamp, "joinedAt" timestamp) ON COMMIT DROP',
        );
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE training_workouts (id text PRIMARY KEY, "userId" text, "finishedAt" timestamp, "durationSec" integer, "completedSets" integer) ON COMMIT DROP',
        );
        const week = new Date('2026-11-02T00:00:00Z');
        const joinedAt = new Date('2026-11-02T10:00:00Z');
        for (const id of [
          'a',
          'b',
          'c',
          'd',
          'e',
          'zz-self',
          ...Array.from({ length: 105 }, (_, index) => `user-${String(index).padStart(3, '0')}`),
        ]) {
          await tx.$executeRaw`INSERT INTO users VALUES (${id}, ${id}, NULL, NULL)`;
          await tx.$executeRaw`INSERT INTO training_challenge_entries VALUES (${id}, 'active-hour', ${week}, ${joinedAt})`;
        }
        await tx.$executeRaw`INSERT INTO users VALUES ('deleted', 'Deleted account', NULL, ${joinedAt})`;
        await tx.$executeRaw`INSERT INTO training_challenge_entries VALUES ('deleted', 'active-hour', ${week}, ${joinedAt})`;
        for (const event of [
          { id: 'a-first', user: 'a', date: '2026-11-02T11:00:00Z', seconds: 3600, sets: 12 },
          { id: 'a-extra', user: 'a', date: '2026-11-02T15:00:00Z', seconds: 3600, sets: 12 },
          { id: 'b-first', user: 'b', date: '2026-11-02T12:00:00Z', seconds: 3600, sets: 1 },
          { id: 'c-first', user: 'c', date: '2026-11-02T13:00:00Z', seconds: 1800, sets: 1 },
          { id: 'd-first', user: 'd', date: '2026-11-02T14:00:00Z', seconds: 2700, sets: 1 },
          { id: 'before', user: 'e', date: '2026-11-02T09:00:00Z', seconds: 3600, sets: 1 },
          { id: 'empty', user: 'e', date: '2026-11-02T15:00:00Z', seconds: 3600, sets: 0 },
          { id: 'next-week', user: 'e', date: '2026-11-09T15:00:00Z', seconds: 3600, sets: 1 },
        ]) {
          await tx.$executeRaw`INSERT INTO training_workouts VALUES (${event.id}, ${event.user}, ${new Date(event.date)}, ${event.seconds}, ${event.sets})`;
        }
        type Row = { userId: string; rank: bigint; progress: number; participantCount: bigint };
        const rows = await tx.$queryRaw<Row[]>(
          challengeRankingQuery(
            { id: 'active-hour', metric: 'minutes', target: 60 },
            week,
            'zz-self',
          ),
        );
        expect(rows.slice(0, 4).map((row) => [row.userId, Number(row.rank), row.progress])).toEqual(
          [
            ['a', 1, 60],
            ['b', 2, 60],
            ['d', 3, 45],
            ['c', 4, 30],
          ],
        );
        expect(rows).toHaveLength(101);
        expect(Number(rows[0]?.participantCount)).toBe(111);
        expect(rows.find((row) => row.userId === 'e')?.progress).toBe(0);
        expect(Number(rows.at(-1)?.rank)).toBe(111);
        await tx.$executeRaw`UPDATE training_challenge_entries SET "challengeId" = 'weekly-three'`;
        const workouts = await tx.$queryRaw<Row[]>(
          challengeRankingQuery({ id: 'weekly-three', metric: 'workouts', target: 3 }, week, 'a'),
        );
        expect(workouts[0]).toMatchObject({ userId: 'a', progress: 2 });
        await tx.$executeRaw`UPDATE training_challenge_entries SET "challengeId" = 'twenty-sets'`;
        const sets = await tx.$queryRaw<Row[]>(
          challengeRankingQuery({ id: 'twenty-sets', metric: 'sets', target: 20 }, week, 'a'),
        );
        expect(sets[0]).toMatchObject({ userId: 'a', progress: 20 });
      },
      { timeout: 15000 },
    );
  });
});
