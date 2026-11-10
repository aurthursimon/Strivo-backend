import { PrismaClient } from '@prisma/client';
import { programRankingQuery, programDayNumbers } from '../program-ranking';
const connection = process.env.CHALLENGE_TEST_DATABASE_URL;
const databaseTests = connection ? describe : describe.skip;
databaseTests('program participant rankings SQL', () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    if (!connection || !['127.0.0.1', 'localhost'].includes(new URL(connection).hostname))
      throw new Error('Use an isolated local test database');
    prisma = new PrismaClient({ datasources: { db: { url: connection } } });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  it('ranks only real active members by valid unique days and paginates with own position', async () => {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE users (id text PRIMARY KEY, name text, "avatarUrl" text, "deletedAt" timestamp) ON COMMIT DROP',
        );
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE trainer_program_enrollments ("userId" text, "programId" text, status text, "completedDays" jsonb, "joinedAt" timestamp, "updatedAt" timestamp) ON COMMIT DROP',
        );
        for (let i = 0; i < 36; i++) {
          const id = `user-${String(i).padStart(2, '0')}`;
          await tx.$executeRaw`INSERT INTO users VALUES (${id}, ${id}, NULL, NULL)`;
          const completed =
            i === 0 ? '[1,1,2,999,"2"]' : i === 1 ? '[1,2]' : i === 2 ? '{}' : '[1]';
          await tx.$executeRaw`INSERT INTO trainer_program_enrollments VALUES (${id}, 'program', ${i === 35 ? 'PAUSED' : 'ACTIVE'}, ${completed}::jsonb, ${new Date(1760000000000 + i * 1000)}, ${new Date(1760000000000 + i * 1000)})`;
        }
        await tx.$executeRaw`UPDATE users SET "deletedAt" = NOW() WHERE id = 'user-34'`;
        const first = await tx.$queryRaw<any[]>(
          programRankingQuery('program', 'user-02', [1, 2], 1),
        );
        expect(first).toHaveLength(31);
        expect(first[0]).toMatchObject({ userId: 'user-00', completed: 2, rank: 1n, total: 34n });
        expect(first[1]).toMatchObject({ userId: 'user-01', completed: 2, rank: 2n });
        expect(first.at(-1)).toMatchObject({ userId: 'user-02', completed: 0, rank: 34n });
        const next = await tx.$queryRaw<any[]>(
          programRankingQuery('program', 'user-02', [1, 2], 2),
        );
        expect(next.map((row) => Number(row.rank))).toEqual([31, 32, 33, 34]);
        const empty = await tx.$queryRaw<any[]>(programRankingQuery('program', 'user-02', [], 1));
        expect(empty.every((row) => row.completed === 0)).toBe(true);
      },
      { timeout: 15000 },
    );
  });
});

describe('program day validation', () => {
  it('uses only positive integer day numbers without duplicates', () => {
    expect(
      programDayNumbers([
        { dayNumber: 1 },
        { dayNumber: 1 },
        { dayNumber: '2' },
        { dayNumber: 2 },
        null,
        { dayNumber: -1 },
      ]),
    ).toEqual([1, 2]);
    expect(programDayNumbers({})).toEqual([]);
  });
});
