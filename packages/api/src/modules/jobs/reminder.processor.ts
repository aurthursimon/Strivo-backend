import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { PushService } from './push.service';

type ReminderUiLocale = 'en' | 'pt' | 'es';

type MealSlot = 'breakfast' | 'afternoonSnack' | 'lunch' | 'dinner';

interface ReminderJobData {
  type: 'meal' | 'water' | 'streak' | 'hourly-reminders';
  userId?: string;
}

const WATER_DAY_START_H = 8;
const WATER_DAY_END_H = 21;

function validTimeZone(timeZone: string | undefined | null): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function toUiLocale(locale: string | undefined | null): ReminderUiLocale {
  const normalized = locale?.trim().toLowerCase() ?? '';
  if (normalized.startsWith('pt')) return 'pt';
  if (normalized.startsWith('es')) return 'es';
  return 'en';
}

function clockHmInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).formatToParts(date);
  let hh = '00';
  let mm = '00';
  for (const part of parts) {
    if (part.type === 'hour') hh = part.value.padStart(2, '0');
    if (part.type === 'minute') mm = part.value.padStart(2, '0');
  }
  return `${hh}:${mm}`;
}

function calendarHourLocal(date: Date, timeZone: string): number {
  const hm = clockHmInTz(date, timeZone);
  const h = Number(hm.slice(0, 2));
  return Number.isFinite(h) ? h : 0;
}

function calendarAnchorInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
}

const PUSH_COPY: Record<
  ReminderUiLocale,
  Record<MealSlot | 'water' | 'streak', { title: string; body: string }>
> = {
  en: {
    breakfast: {
      title: 'Breakfast',
      body: 'Log your meal and keep the day on track.',
    },
    afternoonSnack: {
      title: 'Afternoon snack',
      body: 'Time to log your snack.',
    },
    lunch: {
      title: 'Lunch',
      body: 'Lunch reminder — quick log in the app.',
    },
    dinner: {
      title: 'Dinner',
      body: 'Do not forget to log dinner.',
    },
    water: {
      title: 'Hydration',
      body: 'Time for water — mark it in My Peptides.',
    },
    streak: {
      title: 'Streak at risk',
      body: 'You can still log something today and keep your streak.',
    },
  },
  pt: {
    breakfast: {
      title: 'Café da manhã',
      body: 'Registre sua refeição e mantenha o dia no caminho certo.',
    },
    afternoonSnack: {
      title: 'Lanche da tarde',
      body: 'Hora de registrar seu lanche.',
    },
    lunch: {
      title: 'Almoço',
      body: 'Lembrete do almoço — faça um registro rápido no app.',
    },
    dinner: {
      title: 'Jantar',
      body: 'Não se esqueça de registrar o jantar.',
    },
    water: {
      title: 'Hidratação',
      body: 'Hora de beber água — registre no My Peptides.',
    },
    streak: {
      title: 'Sequência em risco',
      body: 'Você ainda pode registrar algo hoje e manter sua sequência.',
    },
  },
  es: {
    breakfast: {
      title: 'Desayuno',
      body: 'Registra tu comida y mantén el día encaminado.',
    },
    afternoonSnack: {
      title: 'Merienda',
      body: 'Es hora de registrar tu merienda.',
    },
    lunch: {
      title: 'Almuerzo',
      body: 'Recordatorio del almuerzo: regístralo rápidamente en la app.',
    },
    dinner: {
      title: 'Cena',
      body: 'No olvides registrar la cena.',
    },
    water: {
      title: 'Hidratación',
      body: 'Es hora de beber agua: regístrala en My Peptides.',
    },
    streak: {
      title: 'Racha en riesgo',
      body: 'Aún puedes registrar algo hoy y mantener tu racha.',
    },
  },
};

@Injectable()
export class ReminderProcessor {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  async process(data: ReminderJobData): Promise<void> {
    const { type, userId } = data;
    const now = new Date();

    if (userId && type !== 'hourly-reminders') {
      const localeRow = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { locale: true },
      });
      const ui = toUiLocale(localeRow?.locale);
      if (type === 'meal') {
        await this.sendMealHint(userId, ui, 'lunch');
        return;
      }
      await this.deliverWaterOrStreak(userId, type, ui);
      return;
    }

    if (type === 'hourly-reminders') {
      await this.processHourlyReminders(now);
      return;
    }

    if (type === 'streak') {
      await this.processStreakRiskBatch(now);
      return;
    }

    this.logger.warn(`Ignored reminders job type=${type} (use hourly-reminders or streak)`);
  }

  private normalizeHm(raw: string): string | null {
    const trimmed = raw.trim();
    const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || !Number.isFinite(hh) || !Number.isFinite(mm))
      return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  private async deliverWaterOrStreak(
    userId: string,
    kind: 'water' | 'streak',
    ui: ReminderUiLocale,
  ): Promise<void> {
    const copy = PUSH_COPY[ui][kind];
    await this.pushService.sendToUser(userId, {
      title: copy.title,
      body: copy.body,
      url: '/',
    });
  }

  private async sendMealHint(userId: string, ui: ReminderUiLocale, slot: MealSlot): Promise<void> {
    const copy = PUSH_COPY[ui][slot];
    await this.pushService.sendToUser(userId, {
      title: copy.title,
      body: copy.body,
      url: '/',
    });
  }

  private async processHourlyReminders(now: Date): Promise<void> {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: {
        pushEnabled: true,
        OR: [
          { breakfast: true },
          { afternoonSnack: true },
          { lunch: true },
          { dinner: true },
          { water: true },
        ],
      },
      select: {
        userId: true,
        breakfast: true,
        breakfastTime: true,
        afternoonSnack: true,
        afternoonSnackTime: true,
        lunch: true,
        lunchTime: true,
        dinner: true,
        dinnerTime: true,
        water: true,
        waterIntervalH: true,
        pushSubscription: true,
        user: { select: { locale: true, timezone: true } },
      },
    });

    let mealHints = 0;
    let waterHints = 0;

    for (const pref of prefs) {
      if (!pref.pushSubscription) continue;

      const tz = validTimeZone(pref.user.timezone);
      const ui = toUiLocale(pref.user.locale);
      const hhmmNow = clockHmInTz(now, tz);

      const pairs: Array<{ on: boolean; time: string; slot: MealSlot }> = [
        { on: pref.breakfast, time: pref.breakfastTime, slot: 'breakfast' },
        { on: pref.afternoonSnack, time: pref.afternoonSnackTime, slot: 'afternoonSnack' },
        { on: pref.lunch, time: pref.lunchTime, slot: 'lunch' },
        { on: pref.dinner, time: pref.dinnerTime, slot: 'dinner' },
      ];

      for (const pair of pairs) {
        const normTime = this.normalizeHm(pair.time);
        if (pair.on && normTime !== null && normTime === hhmmNow) {
          try {
            await this.sendMealHint(pref.userId, ui, pair.slot);
            mealHints++;
          } catch {
            this.logger.warn(`Meal reminder failed user ${pref.userId} slot ${pair.slot}`);
          }
        }
      }

      if (pref.water) {
        const hLocal = calendarHourLocal(now, tz);
        const interval = Math.min(24, Math.max(1, pref.waterIntervalH || 2));
        if (
          hLocal >= WATER_DAY_START_H &&
          hLocal <= WATER_DAY_END_H &&
          (hLocal - WATER_DAY_START_H) % interval === 0
        ) {
          try {
            await this.deliverWaterOrStreak(pref.userId, 'water', ui);
            waterHints++;
          } catch {
            this.logger.warn(`Water reminder failed user ${pref.userId}`);
          }
        }
      }
    }

    this.logger.log(
      `Hourly reminders: meal=${mealHints} water=${waterHints} (${prefs.length} prefs)`,
    );
  }

  private async processStreakRiskBatch(now: Date): Promise<void> {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { pushEnabled: true, streakRisk: true },
      select: {
        userId: true,
        pushSubscription: true,
        user: {
          select: {
            locale: true,
            timezone: true,
            streak: { select: { currentStreak: true, lastActiveDate: true } },
          },
        },
      },
    });

    let sent = 0;
    for (const pref of prefs) {
      if (!pref.pushSubscription) continue;
      const streak = pref.user.streak;
      if (!streak || streak.currentStreak <= 0) continue;
      const timeZone = validTimeZone(pref.user.timezone);
      if (
        calendarAnchorInTz(streak.lastActiveDate, timeZone) === calendarAnchorInTz(now, timeZone)
      ) {
        continue;
      }
      try {
        await this.deliverWaterOrStreak(pref.userId, 'streak', toUiLocale(pref.user.locale));
        sent++;
      } catch {
        this.logger.warn(`Streak reminder failed user ${pref.userId}`);
      }
    }

    this.logger.log(`Streak risk reminders sent=${sent} (candidates ${prefs.length})`);
  }
}
