import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { fromGoalType, serializeGoal, serializeUser } from '../../common/enum-maps';
import { PrismaService } from '../../prisma';
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
import { serializeMealPlan } from '../diet/diet.serializer';
import { WorkoutService } from '../workout';
import type { WorkoutProfileDto } from '../workout/dto';
import { serializeWorkoutPlan } from '../workout/workout.serializer';
import { Glp1Service } from '../glp1';
import { appendSyncChange } from '../sync';
import { notificationPreferencesSyncDraft } from '../sync/handlers/notification-preferences-set.handler';
import type { CompleteOnboardingDto } from './dto';

type ProvisioningStatus = 'READY' | 'BLOCKED' | 'ABSENT';
const TERMS_OF_USE_CONSENT_TYPE = 'terms_of_use';
const TERMS_OF_USE_VERSION = '1.0.0';
const NUTRITION_SOURCES_CONSENT_TYPE = 'nutrition_sources';
const NUTRITION_SOURCES_VERSION = '2026-08-23';

export interface OnboardingCompletionResult {
  onboardingStatus: 'COMPLETED';
  planStatus: 'PARTIAL' | 'READY';
  user: unknown;
  goal: unknown;
  calculations: {
    ageYears: number;
    bmr: number;
    tdee: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiberG: number;
    waterMl: number;
    algorithmVersion: string;
    algorithmReviewStatus: string;
  };
  dietPlan: unknown | null;
  dietPlanStatus: ProvisioningStatus;
  workoutPlan: unknown | null;
  workoutPlanStatus: ProvisioningStatus;
  glp1Setup: unknown;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dietService: DietService,
    private readonly glp1Service: Glp1Service,
    private readonly workoutService: WorkoutService,
  ) {}

  async complete(
    userId: string,
    dto: CompleteOnboardingDto,
    locale: string,
    idempotencyKey?: string,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const requestHash = createHash('sha256').update(JSON.stringify({ dto, locale })).digest('hex');
    const replay = await this.prisma.onboardingSubmission.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    });
    let claimed = false;
    if (replay) {
      if (replay.status !== 'FAILED') {
        return this.handleReplay(replay, requestHash);
      }
      if (replay.requestHash !== requestHash) {
        return this.handleReplay(replay, requestHash);
      }
      let retryClaim: { count: number };
      try {
        retryClaim = await this.prisma.onboardingSubmission.updateMany({
          where: { id: replay.id, status: 'FAILED' },
          data: { status: 'PROCESSING', errorCode: null },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({
            code: 'ONBOARDING_IN_PROGRESS',
            message: 'Outra conclusao do onboarding ja esta em processamento.',
          });
        }
        throw error;
      }
      if (retryClaim.count !== 1) {
        throw new ConflictException({
          code: 'ONBOARDING_IN_PROGRESS',
          message: 'A conclusao do onboarding com esta chave ainda esta em processamento.',
        });
      }
      claimed = true;
    } else {
      const completed = await this.prisma.onboardingSubmission.findFirst({
        where: { userId, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
      });
      if (completed) {
        throw new ConflictException({
          code: 'ONBOARDING_ALREADY_COMPLETED',
          message: 'O onboarding ja foi concluido. Use a atualizacao de dados corporais.',
          result: completed.resultJson,
        });
      }
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingCompleted: true },
      });
      if (user?.onboardingCompleted) {
        throw new ConflictException({
          code: 'ONBOARDING_ALREADY_COMPLETED',
          message: 'O onboarding ja foi concluido. Use a atualizacao de dados corporais.',
        });
      }
    }

    if (!claimed) {
      try {
        await this.prisma.onboardingSubmission.create({
          data: { userId, idempotencyKey: key, requestHash },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const concurrent = await this.prisma.onboardingSubmission.findUnique({
            where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
          });
          if (concurrent) return this.handleReplay(concurrent, requestHash);
          const otherOperation = await this.prisma.onboardingSubmission.findFirst({
            where: { userId, status: 'PROCESSING' },
            orderBy: { createdAt: 'desc' },
          });
          if (otherOperation) {
            throw new ConflictException({
              code: 'ONBOARDING_IN_PROGRESS',
              message: 'Outra conclusao do onboarding ja esta em processamento.',
            });
          }
        }
        throw error;
      }
    }

    try {
      const result = await this.executeCompletion(userId, dto, locale, key);
      return result;
    } catch (error) {
      await this.prisma.onboardingSubmission.update({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
        data: {
          status: 'FAILED',
          errorCode: this.safeErrorCode(error),
        },
      });
      throw error;
    }
  }

  async ensurePlans(userId: string, _locale: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true },
    });
    if (!user?.onboardingCompleted) {
      throw new BadRequestException({
        code: 'ONBOARDING_NOT_COMPLETED',
        message: 'Finalize os dados essenciais do onboarding antes de provisionar os planos.',
      });
    }

    let snapshot = await this.provisioningSnapshot(userId);
    if (!snapshot.dietPlan) {
      const profile = await this.prisma.dietProfile.findUnique({ where: { userId } });
      if (!profile) {
        throw new BadRequestException({
          code: 'DIET_PROFILE_NOT_CONFIGURED',
          message: 'Configure o perfil alimentar antes de criar o plano.',
        });
      }
      await this.dietService.generateReadyPlan(userId, {
        goalType: profile.goalType,
        dietType: profile.dietType ?? undefined,
        restrictions: profile.restrictionsJson as string[],
        dislikedFoods: profile.dislikedFoodsJson as string[],
        mealsPerDay: profile.mealsPerDay,
        targetCalories: profile.targetCalories,
      });
      snapshot = await this.provisioningSnapshot(userId);
    }
    return {
      onboardingStatus: 'COMPLETED' as const,
      planStatus: 'READY' as const,
      dietPlan: snapshot.dietPlan,
      dietPlanStatus: 'READY' as const,
      workoutPlan: snapshot.workoutPlan,
      workoutPlanStatus: snapshot.workoutPlan ? ('READY' as const) : ('ABSENT' as const),
    };
  }

  async preview(dto: CompleteOnboardingDto, locale: string) {
    const activityLevel = dto.activityLevel ?? dto.workouts ?? dto.exerciseLevel;
    if (!activityLevel) {
      throw new BadRequestException('Informe activityLevel ou workouts no onboarding.');
    }
    const gender = dto.gender ?? dto.sex;
    if (!gender) {
      throw new BadRequestException('Informe gender ou sex no onboarding.');
    }
    const goalType = dto.goalType ?? dto.objective;
    if (!goalType) {
      throw new BadRequestException('Informe goalType ou objective no onboarding.');
    }
    const dietTypeRaw = dto.dietType ?? dto.dietStyle;
    if (!dietTypeRaw) {
      throw new BadRequestException('Informe dietType ou dietStyle no onboarding.');
    }

    const ageYears = calculateAge(new Date(dto.birthDate));
    if (ageYears < MINIMUM_NUTRITION_AGE_YEARS || ageYears > 120) {
      throw new BadRequestException('birthDate fora da faixa aceita para calculo de meta.');
    }

    const goalSpeed = dto.goalSpeed ?? 'MODERATE';
    const weeklyGoalKg = dto.weeklyGoalKg ?? weeklyGoalFromSpeed(goalType, goalSpeed);
    const dietType = normalizeDietType(dietTypeRaw);
    const calculations = calculateAll({
      gender,
      weightKg: dto.weightKg,
      heightCm: dto.heightCm,
      ageYears,
      activityLevel,
      goalType,
      dietType,
      weeklyGoalKg,
    });
    const dietProfile = {
      goalType: fromGoalType(goalType),
      dietType,
      restrictions: dto.restrictions ?? [],
      dislikedFoods: dto.dislikedFoods ?? [],
      mealsPerDay: dto.mealsPerDay ?? 4,
      targetCalories: calculations.macros.dailyCalories,
    };

    const diet = await this.dietService.previewReadyPlan(dietProfile as never, locale);

    const workoutDto = this.resolveWorkoutProfileDto(dto);
    let workout = null;
    let workoutStatus: ProvisioningStatus = 'ABSENT';
    if (workoutDto) {
      try {
        workout = await this.workoutService.previewReadyPlan(workoutDto, locale);
        workoutStatus = 'READY';
      } catch {
        workoutStatus = 'ABSENT';
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      nutrition: {
        calories: calculations.macros.dailyCalories,
        protein: calculations.macros.proteinG,
        carbs: calculations.macros.carbsG,
        fat: calculations.macros.fatG,
        fiberG: calculations.macros.fiberG,
        waterMl: calculations.waterMl,
      },
      diet,
      workout,
      workoutStatus,
    };
  }

  private async executeCompletion(
    userId: string,
    dto: CompleteOnboardingDto,
    locale: string,
    idempotencyKey: string,
  ): Promise<OnboardingCompletionResult> {
    const activityLevel = dto.activityLevel ?? dto.workouts ?? dto.exerciseLevel;
    if (!activityLevel) {
      throw new BadRequestException('Informe activityLevel ou workouts no onboarding.');
    }
    const gender = dto.gender ?? dto.sex;
    if (!gender) {
      throw new BadRequestException('Informe gender ou sex no onboarding.');
    }
    const goalType = dto.goalType ?? dto.objective;
    if (!goalType) {
      throw new BadRequestException('Informe goalType ou objective no onboarding.');
    }
    const dietTypeRaw = dto.dietType ?? dto.dietStyle;
    if (!dietTypeRaw) {
      throw new BadRequestException('Informe dietType ou dietStyle no onboarding.');
    }

    const birthDate = new Date(dto.birthDate);
    const ageYears = calculateAge(birthDate);
    if (ageYears < MINIMUM_NUTRITION_AGE_YEARS || ageYears > 120) {
      throw new BadRequestException('birthDate fora da faixa aceita para calculo de meta.');
    }

    const goalSpeed = dto.goalSpeed ?? 'MODERATE';
    const weeklyGoalKg = dto.weeklyGoalKg ?? weeklyGoalFromSpeed(goalType, goalSpeed);
    const dietType = normalizeDietType(dietTypeRaw);
    const calculations = calculateAll({
      gender,
      weightKg: dto.weightKg,
      heightCm: dto.heightCm,
      ageYears,
      activityLevel,
      goalType,
      dietType,
      weeklyGoalKg,
    });
    const waterMl = calculations.waterMl;
    const userDietType = toUserDietType(dietType);
    // O snapshot GLP-1 enviado pelo mobile passa a ser materializado no
    // servidor. Data sem horario nao vira evento de dose: o backend nao
    // inventa um instante clinicamente ambiguo.
    const glp1Consent = dto.consents?.find(
      (consent) => consent.type.trim().toLowerCase() === 'glp1_tracking',
    );
    const termsConsent = dto.consents?.find(
      (consent) => consent.type.trim().toLowerCase() === TERMS_OF_USE_CONSENT_TYPE,
    );
    const nutritionSourcesConsent = dto.consents?.find(
      (consent) => consent.type.trim().toLowerCase() === NUTRITION_SOURCES_CONSENT_TYPE,
    );
    if (
      dto.glp1 &&
      (termsConsent?.version !== TERMS_OF_USE_VERSION ||
        nutritionSourcesConsent?.version !== NUTRITION_SOURCES_VERSION)
    ) {
      throw new BadRequestException({
        code: 'ONBOARDING_ACKNOWLEDGEMENTS_REQUIRED',
        message: 'Aceite dos Termos de Uso e ciencia das fontes nutricionais obrigatorio.',
        missingFields: [
          ...(termsConsent?.version === TERMS_OF_USE_VERSION ? [] : [TERMS_OF_USE_CONSENT_TYPE]),
          ...(nutritionSourcesConsent?.version === NUTRITION_SOURCES_VERSION
            ? []
            : [NUTRITION_SOURCES_CONSENT_TYPE]),
        ],
      });
    }
    const glp1Setup = dto.glp1
      ? await this.glp1Service.setupFromOnboarding(
          userId,
          dto.glp1,
          dto.timezone ?? 'UTC',
          glp1Consent,
        )
      : null;

    const calculationInput = {
      gender,
      weightKg: dto.weightKg,
      heightCm: dto.heightCm,
      ageYears,
      activityLevel,
      goalType,
      goalSpeed,
      weeklyGoalKg,
      dietType,
    };
    const dietProfile = {
      goalType: fromGoalType(goalType),
      dietType,
      restrictions: dto.restrictions ?? [],
      dislikedFoods: dto.dislikedFoods ?? [],
      mealsPerDay: dto.mealsPerDay ?? 4,
      targetCalories: calculations.macros.dailyCalories,
    };
    const baseResult = {
      onboardingStatus: 'COMPLETED' as const,
      planStatus: 'READY' as const,
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
      workoutPlan: null,
      workoutPlanStatus: 'ABSENT' as const,
      glp1Setup,
    };

    const persisted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      await tx.goal.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
      const goalRow = await tx.goal.create({
        data: {
          userId,
          type: goalType,
          goalSpeed,
          targetWeightKg: dto.targetWeightKg,
          dailyCalories: calculations.macros.dailyCalories,
          dailyProteinG: calculations.macros.proteinG,
          dailyCarbsG: calculations.macros.carbsG,
          dailyFatG: calculations.macros.fatG,
          dailyFiberG: calculations.macros.fiberG,
          waterMl,
          weeklyGoalKg,
          algorithmVersion: NUTRITION_ALGORITHM_VERSION,
          calculationInputJson: calculationInput as Prisma.InputJsonValue,
        },
      });
      const userRow = await tx.user.update({
        where: { id: userId },
        data: {
          name: dto.name,
          locale: dto.locale,
          countryCode: dto.countryCode,
          timezone: dto.timezone,
          measurementSystem: dto.measurementSystem,
          regionDetectionSource: dto.regionDetectionSource,
          birthDate: new Date(dto.birthDate),
          gender,
          heightCm: dto.heightCm,
          weightKg: dto.weightKg,
          activityLevel,
          dietType: userDietType as never,
          exerciseCalories: dto.exerciseCalories ?? true,
          rolloverCalories: dto.rolloverCalories ?? false,
          notificationsOptIn: dto.notificationsOptIn,
          onboardingCompleted: true,
          ...(dto.healthConnectOptIn === true
            ? { healthConnectOptIn: true, healthConnectOptInAt: new Date() }
            : dto.healthConnectOptIn === false
              ? { healthConnectOptIn: false, healthConnectOptInAt: null }
              : {}),
        },
      });
      await tx.dietProfile.upsert({
        where: { userId },
        create: {
          userId,
          goalType: dietProfile.goalType,
          dietType: dietProfile.dietType,
          restrictionsJson: dietProfile.restrictions,
          dislikedFoodsJson: dietProfile.dislikedFoods,
          mealsPerDay: dietProfile.mealsPerDay,
          targetCalories: dietProfile.targetCalories,
        },
        update: {
          goalType: dietProfile.goalType,
          dietType: dietProfile.dietType,
          restrictionsJson: dietProfile.restrictions,
          dislikedFoodsJson: dietProfile.dislikedFoods,
          mealsPerDay: dietProfile.mealsPerDay,
          targetCalories: dietProfile.targetCalories,
        },
      });
      if (termsConsent && nutritionSourcesConsent) {
        await tx.consent.createMany({
          data: [
            {
              userId,
              type: TERMS_OF_USE_CONSENT_TYPE,
              version: termsConsent.version,
              accepted: true,
            },
            {
              userId,
              type: NUTRITION_SOURCES_CONSENT_TYPE,
              version: nutritionSourcesConsent.version,
              accepted: true,
            },
          ],
        });
      }
      if (dto.notificationsOptIn !== undefined) {
        const preference = await tx.notificationPreference.upsert({
          where: { userId },
          create: { userId, pushEnabled: dto.notificationsOptIn },
          update: {
            pushEnabled: dto.notificationsOptIn,
            syncOccurredAt: null,
            syncMutationId: null,
            syncInstallationId: null,
            syncSequence: null,
          },
        });
        await appendSyncChange(tx, userId, notificationPreferencesSyncDraft(preference), {
          occurredAt: preference.updatedAt,
        });
      }

      return { userRow, goalRow };
    });

    const dietPlan = await this.dietService.generateReadyPlan(userId, dietProfile as never);

    let workoutPlan = null;
    let workoutPlanStatus: ProvisioningStatus = 'ABSENT';
    const workoutDto = this.resolveWorkoutProfileDto(dto);
    if (workoutDto) {
      try {
        workoutPlan = await this.workoutService.generateReadyPlan(userId, workoutDto, locale);
        workoutPlanStatus = 'READY';
      } catch {
        workoutPlanStatus = 'BLOCKED';
      }
    }

    const result: OnboardingCompletionResult = {
      ...baseResult,
      user: serializeUser(persisted.userRow),
      goal: serializeGoal(persisted.goalRow),
      dietPlan,
      dietPlanStatus: 'READY',
      workoutPlan,
      workoutPlanStatus,
    };
    await this.prisma.onboardingSubmission.update({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      data: {
        status: 'COMPLETED',
        resultJson: result as unknown as Prisma.InputJsonValue,
        errorCode: null,
      },
    });
    return result;
  }

  private resolveWorkoutProfileDto(dto: CompleteOnboardingDto): WorkoutProfileDto | null {
    if (dto.planProvisioning?.generateWorkoutPlan === false) {
      return null;
    }
    const rawDaysOfWeek = dto.workoutDaysOfWeek ?? dto.daysOfWeek;
    const daysPerWeek =
      dto.workoutDaysPerWeek ??
      dto.daysPerWeek ??
      (rawDaysOfWeek && rawDaysOfWeek.length > 0 ? rawDaysOfWeek.length : undefined);

    const hasExplicitWorkoutRequest = Boolean(
      dto.planProvisioning?.generateWorkoutPlan === true ||
        (rawDaysOfWeek && rawDaysOfWeek.length > 0),
    );

    if (!hasExplicitWorkoutRequest) return null;

    const resolvedDaysPerWeek = Math.min(7, Math.max(1, daysPerWeek ?? 3));
    const defaultDays: Record<number, number[]> = {
      1: [1],
      2: [1, 4],
      3: [1, 3, 5],
      4: [1, 2, 4, 5],
      5: [1, 2, 3, 5, 6],
      6: [1, 2, 3, 4, 5, 6],
      7: [0, 1, 2, 3, 4, 5, 6],
    };
    const resolvedDaysOfWeek =
      rawDaysOfWeek && rawDaysOfWeek.length === resolvedDaysPerWeek
        ? rawDaysOfWeek
        : (defaultDays[resolvedDaysPerWeek] ?? [1, 3, 5]);

    const experience = (dto.workoutExperience ?? dto.experience ?? 'beginner') as
      | 'beginner'
      | 'intermediate'
      | 'advanced';
    const rawLoc = (
      dto.workoutLocation ??
      dto.location ??
      (dto.workoutEquipment === 'home' || dto.equipment === 'home' ? 'HOME' : 'GYM')
    ).toUpperCase();
    const location = (rawLoc === 'HOME' ? 'HOME' : 'GYM') as 'HOME' | 'GYM';
    const minutesPerSession = dto.workoutMinutesPerSession ?? dto.minutesPerSession ?? 45;

    let availableEquipment = dto.availableEquipment ?? [];
    if (availableEquipment.length === 0) {
      availableEquipment =
        location === 'GYM'
          ? ['dumbbells', 'barbell', 'bench', 'cable', 'machines']
          : ['bodyweight'];
    }

    return {
      experience: experience as any,
      daysPerWeek: resolvedDaysPerWeek,
      daysOfWeek: resolvedDaysOfWeek,
      location: location as any,
      splitPreference: (dto.splitPreference ?? 'AUTO') as any,
      goal: (dto.workoutGoal ?? 'GENERAL_FITNESS') as any,
      healthConditions: dto.healthConditions ?? [],
      equipment: location === 'GYM' ? 'gym' : 'bodyweight',
      availableEquipment,
      minutesPerSession,
    };
  }

  private async provisioningSnapshot(userId: string) {
    const [dietPlan, workoutPlan] = await Promise.all([
      this.prisma.mealPlan.findFirst({
        where: { userId, active: true },
        orderBy: { generatedAt: 'desc' },
      }),
      this.prisma.workoutPlan.findFirst({
        where: { userId, active: true },
        orderBy: { generatedAt: 'desc' },
      }),
    ]);
    return {
      dietPlan: dietPlan ? serializeMealPlan(dietPlan) : null,
      workoutPlan: workoutPlan ? serializeWorkoutPlan(workoutPlan) : null,
    };
  }

  private handleReplay(
    submission: {
      requestHash: string;
      status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
      resultJson: unknown;
    },
    requestHash: string,
  ): OnboardingCompletionResult {
    if (submission.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'A chave de idempotencia ja foi usada com outro payload.',
      });
    }
    if (submission.status === 'COMPLETED' && submission.resultJson) {
      return submission.resultJson as unknown as OnboardingCompletionResult;
    }
    if (submission.status === 'PROCESSING') {
      throw new ConflictException({
        code: 'ONBOARDING_IN_PROGRESS',
        message: 'A conclusao do onboarding com esta chave ainda esta em processamento.',
      });
    }
    throw new ConflictException({
      code: 'ONBOARDING_IN_PROGRESS',
      message: 'A conclusao do onboarding com esta chave ainda esta em processamento.',
    });
  }

  private requireIdempotencyKey(value?: string): string {
    const key = value?.trim();
    if (!key || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Header Idempotency-Key obrigatorio e limitado a 128 caracteres.',
      });
    }
    return key;
  }

  private safeErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'name' in error) {
      return String(error.name).slice(0, 80);
    }
    return 'ONBOARDING_FAILED';
  }
}
