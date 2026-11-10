import { Prisma } from '@prisma/client';
import { calendarDayInTimeZone } from '../../../common/date/calendar-day';

export async function lockSyncUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
}

export async function getOrCreateDailyLog(
  tx: Prisma.TransactionClient,
  userId: string,
  occurredAt: Date,
  dayOverride?: Date,
) {
  const [user, goal] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    tx.goal.findFirst({ where: { userId, isActive: true } }),
  ]);
  const date = dayOverride ?? calendarDayInTimeZone(occurredAt, user?.timezone);
  const dailyLog = await tx.dailyLog.upsert({
    where: { userId_date: { userId, date } },
    update: {},
    create: {
      userId,
      date,
      targetCalories: goal?.dailyCalories,
      targetProteinG: goal?.dailyProteinG,
      targetCarbsG: goal?.dailyCarbsG,
      targetFatG: goal?.dailyFatG,
    },
  });
  return { dailyLog, date };
}
