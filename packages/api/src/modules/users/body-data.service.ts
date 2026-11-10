import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { fromGoalType, serializeGoal, serializeUser } from '../../common/enum-maps';
import {
  calculateAge,
  calculateAll,
  MINIMUM_NUTRITION_AGE_YEARS,
  NUTRITION_ALGORITHM_REVIEW_STATUS,
  NUTRITION_ALGORITHM_VERSION,
  normalizeDietType,
  toUserDietType,
  weeklyGoalFromSpeed,
} from '../../shared';
import { DietService } from '../diet';
import { WorkoutService } from '../workout';
import type { BodyDataDto } from './dto';

const USER_WITH_BODY_SELECT = {
  id: true,
  name: true,
  birthDate: true,
  gender: true,
  heightCm: true,
  weightKg: true,
  activityLevel: true,
  dietType: true,
  exerciseCalories: true,
  rolloverCalories: true,
  notificationsOptIn: true,
  deletedAt: true,
} as const;

const ACTIVE_GOAL_SELECT = {
  id: true,
  type: true,
  goalSpeed: true,
  targetWeightKg: true,
  weeklyGoalKg: true,
} as const;

const USER_RESPONSE_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  provider: true,
  emailVerified: true,
  locale: true,
  birthDate: true,
  gender: true,
  heightCm: true,
  weightKg: true,
  activityLevel: true,
  dietType: true,
  exerciseCalories: true,
  rolloverCalories: true,
  notificationsOptIn: true,
  onboardingCompleted: true,
  healthConnectOptIn: true,
  healthConnectOptInAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

@Injectable()
export class BodyDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dietService: DietService,
    private readonly workoutService: WorkoutService,
  ) {}

  async update(userId: string, dto: BodyDataDto, _locale: string) {
    const [user, activeGoal, dietProfile, workoutProfile] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: USER_WITH_BODY_SELECT,
      }),
      this.prisma.goal.findFirst({
        where: { userId, isActive: true },
        select: ACTIVE_GOAL_SELECT,
      }),
      this.prisma.dietProfile.findUnique({ where: { userId } }),
      this.prisma.workoutProfile.findUnique({ where: { userId } }),
    ]);

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    const birthDate = dto.birthDate
      ? new Date(dto.birthDate)
      : user.birthDate
        ? new Date(user.birthDate)
        : undefined;
    const gender = dto.gender ?? dto.sex ?? user.gender ?? undefined;
    const heightCm = dto.heightCm ?? user.heightCm ?? undefined;
    const weightKg = dto.weightKg ?? user.weightKg ?? undefined;
    const activityLevel =
      dto.activityLevel ?? dto.workouts ?? dto.exerciseLevel ?? user.activityLevel ?? undefined;
    const goalType = dto.goalType ?? dto.objective ?? activeGoal?.type ?? undefined;
    const goalSpeed = dto.goalSpeed ?? activeGoal?.goalSpeed ?? 'MODERATE';

    this.assertPresent(birthDate, 'birthDate');
    this.assertPresent(gender, 'gender');
    this.assertPresent(heightCm, 'heightCm');
    this.assertPresent(weightKg, 'weightKg');
    this.assertPresent(activityLevel, 'workouts');
    this.assertPresent(goalType, 'goalType');

    const ageYears = calculateAge(birthDate);
    if (ageYears < MINIMUM_NUTRITION_AGE_YEARS || ageYears > 120) {
      throw new BadRequestException('birthDate fora da faixa aceita para calculo de meta.');
    }

    const goalChanged =
      dto.goalType !== undefined || dto.objective !== undefined || dto.goalSpeed !== undefined;
    const defaultWeeklyGoalKg = weeklyGoalFromSpeed(goalType, goalSpeed);
    const weeklyGoalKg =
      dto.weeklyGoalKg ??
      (goalChanged ? defaultWeeklyGoalKg : (activeGoal?.weeklyGoalKg ?? defaultWeeklyGoalKg));
    const dietTypeRaw =
      dto.dietType ?? dto.dietStyle ?? dietProfile?.dietType ?? user.dietType ?? 'OTHER';
    const dietType = normalizeDietType(dietTypeRaw);
    const calculations = calculateAll({
      gender,
      weightKg,
      heightCm,
      ageYears,
      activityLevel,
      goalType,
      dietType,
      weeklyGoalKg,
    });
    const waterMl = calculations.waterMl;
    const userDietType = toUserDietType(dietType);

    const dietDto = {
      goalType: fromGoalType(goalType),
      dietType,
      restrictions: dto.restrictions ?? asStringArray(dietProfile?.restrictionsJson),
      dislikedFoods: dto.dislikedFoods ?? asStringArray(dietProfile?.dislikedFoodsJson),
      mealsPerDay: dto.mealsPerDay ?? dietProfile?.mealsPerDay ?? 4,
      targetCalories: calculations.macros.dailyCalories,
    };

    const targetWeightKg = dto.targetWeightKg ?? activeGoal?.targetWeightKg ?? undefined;
    const { goal, updatedUser } = await this.prisma.$transaction(async (tx) => {
      const savedGoal = await this.upsertActiveGoal(tx, userId, {
        type: goalType,
        goalSpeed,
        targetWeightKg,
        calories: calculations.macros.dailyCalories,
        protein: calculations.macros.proteinG,
        carbs: calculations.macros.carbsG,
        fat: calculations.macros.fatG,
        fiberG: calculations.macros.fiberG,
        waterMl,
        weeklyGoalKg,
        calculationInput: {
          gender,
          weightKg,
          heightCm,
          ageYears,
          activityLevel,
          goalType,
          goalSpeed,
          weeklyGoalKg,
          dietType,
        },
      });
      const savedUser = await tx.user.update({
        where: { id: userId },
        data: {
          name: dto.name ?? user.name,
          locale: dto.locale,
          birthDate,
          gender,
          heightCm,
          weightKg,
          activityLevel,
          dietType: userDietType as never,
          exerciseCalories: dto.exerciseCalories ?? user.exerciseCalories,
          rolloverCalories: dto.rolloverCalories ?? user.rolloverCalories,
          notificationsOptIn: dto.notificationsOptIn ?? user.notificationsOptIn,
          onboardingCompleted: true,
        },
        select: USER_RESPONSE_SELECT,
      });

      return { goal: savedGoal, updatedUser: serializeUser(savedUser) };
    });

    let dietPlan: unknown = null;
    let updatedDietProfile: unknown;

    if (dto.regeneratePlans === false) {
      updatedDietProfile = await this.dietService.upsertProfile(userId, dietDto as never);
      dietPlan = await this.tryGetDietPlan(userId);
    } else {
      dietPlan = await this.dietService.generateReadyPlan(userId, dietDto as never);
      updatedDietProfile = await this.dietService.getProfile(userId);
    }
    const workoutPlan = await this.tryGetWorkoutPlan(userId);
    const updatedWorkoutProfile = workoutProfile
      ? await this.workoutService.getProfile(userId)
      : null;

    return {
      user: updatedUser,
      goal,
      calculations: {
        ageYears,
        bmr: calculations.bmr,
        tdee: calculations.tdee,
        calories: calculations.macros.dailyCalories,
        protein: calculations.macros.proteinG,
        carbs: calculations.macros.carbsG,
        fat: calculations.macros.fatG,
        fiberG: calculations.macros.fiberG,
        waterMl,
        algorithmVersion: NUTRITION_ALGORITHM_VERSION,
        algorithmReviewStatus: NUTRITION_ALGORITHM_REVIEW_STATUS,
      },
      dietProfile: updatedDietProfile,
      workoutProfile: updatedWorkoutProfile,
      dietPlan,
      workoutPlan,
    };
  }

  private async upsertActiveGoal(
    tx: Pick<PrismaService, 'goal'>,
    userId: string,
    input: {
      type: string;
      goalSpeed: string;
      targetWeightKg?: number;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiberG: number;
      waterMl: number;
      weeklyGoalKg?: number;
      calculationInput: Record<string, unknown>;
    },
  ) {
    const data = {
      type: input.type as never,
      goalSpeed: input.goalSpeed as never,
      targetWeightKg: input.targetWeightKg ?? null,
      dailyCalories: input.calories,
      dailyProteinG: input.protein,
      dailyCarbsG: input.carbs,
      dailyFatG: input.fat,
      dailyFiberG: input.fiberG,
      waterMl: input.waterMl,
      weeklyGoalKg: input.weeklyGoalKg ?? null,
      algorithmVersion: NUTRITION_ALGORITHM_VERSION,
      calculationInputJson: input.calculationInput as never,
    };

    const activeGoal = await tx.goal.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });

    if (!activeGoal) {
      await tx.goal.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
      const created = await tx.goal.create({
        data: { userId, ...data, isActive: true },
      });
      return serializeGoal(created);
    }

    const updated = await tx.goal.update({
      where: { id: activeGoal.id },
      data,
    });
    return serializeGoal(updated);
  }

  private async tryGetDietPlan(userId: string) {
    try {
      return await this.dietService.getActivePlan(userId);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  private async tryGetWorkoutPlan(userId: string) {
    try {
      return await this.workoutService.getActivePlan(userId);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  private assertPresent<T>(value: T | null | undefined, field: string): asserts value is T {
    if (value === undefined || value === null) {
      throw new BadRequestException(`Informe ${field} para recalcular o plano.`);
    }
  }
}
