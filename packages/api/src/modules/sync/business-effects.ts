import type { Prisma } from '@prisma/client';

async function unlockAchievement(
  tx: Prisma.TransactionClient,
  userId: string,
  slug: string,
): Promise<void> {
  const definition = await tx.achievementDefinition.findUnique({ where: { slug } });
  if (!definition) return;

  await tx.userAchievement.upsert({
    where: {
      userId_achievementId: { userId, achievementId: definition.id },
    },
    create: { userId, achievementId: definition.id },
    update: {},
  });
}

function serverCalendarDay(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export async function applyMealCreatedEffects(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
): Promise<void> {
  const today = serverCalendarDay(now);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const existing = await tx.streak.findUnique({ where: { userId } });
  let currentStreak: number;
  if (!existing) {
    const created = await tx.streak.create({
      data: {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: today,
      },
    });
    currentStreak = created.currentStreak;
  } else if (existing.lastActiveDate.getTime() === today.getTime()) {
    currentStreak = Math.max(existing.currentStreak, 1);
    if (currentStreak !== existing.currentStreak) {
      await tx.streak.update({
        where: { userId },
        data: {
          currentStreak,
          longestStreak: Math.max(currentStreak, existing.longestStreak),
          lastActiveDate: today,
        },
      });
    }
  } else {
    currentStreak =
      existing.lastActiveDate.getTime() === yesterday.getTime() ? existing.currentStreak + 1 : 1;
    await tx.streak.update({
      where: { userId },
      data: {
        currentStreak,
        longestStreak: Math.max(currentStreak, existing.longestStreak),
        lastActiveDate: today,
      },
    });
  }

  await unlockAchievement(tx, userId, 'first_meal');
  if (currentStreak >= 7) {
    await unlockAchievement(tx, userId, 'streak_7');
  }
}

export async function applyWeightLoggedEffects(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const daysWithWeight = await tx.dailyLog.count({
    where: { userId, weightKg: { not: null } },
  });
  if (daysWithWeight >= 3) {
    await unlockAchievement(tx, userId, 'weight_logs_3');
  }
}
