import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
  serializeWorkoutPlan,
  serializeWorkoutProfile,
  serializeWorkoutSession,
} from './workout.serializer';
import { localizeWorkoutPlan } from './workout.localization';
import type { WorkoutProfileInput } from './workout.prompts';
import { WorkoutSafetyService } from './workout.safety';
import type {
  CreateSessionDto,
  SwapExerciseDto,
  UpdateSessionDto,
  UpdateWorkoutPlanDto,
  WorkoutProfileDto,
} from './dto';
import type { WorkoutGoal, WorkoutLocation, WorkoutSplitPreference } from './dto';
import { appendSyncChange, deleteSyncDraft } from '../sync';
import { workoutSessionDraft } from '../sync/handlers/workout-session-start.handler';

const VALID_CATEGORIES = new Set(['STRENGTH', 'CARDIO', 'FLEXIBILITY', 'HIIT', 'RECOVERY']);
const VALID_DIFFICULTY = new Set(['beginner', 'intermediate', 'advanced']);
const EXPERIENCE_SCORE: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const DEFAULT_EXPERIENCE_SCORE = 0;

interface WorkoutExercise {
  id: string;
  name: string;
  category: string;
  muscleGroups: unknown[];
  sets?: number;
  reps?: string;
  durationSec?: number;
  restSec: number;
  instructions: string;
  setup?: string;
  execution?: string;
  breathing?: string;
  tempo?: string;
  targetRpe?: string;
  progression?: string;
  equipment?: unknown[];
  commonMistakes: unknown[];
  alternatives: unknown[];
  safetyNotes: unknown[];
  videoUrl?: string;
  difficulty: string;
  sourceKey?: string;
}

interface WorkoutDay {
  dayOfWeek: number;
  name: string;
  focusArea: string;
  estimatedMinutes: number;
  exercises: WorkoutExercise[];
}

interface WorkoutTemplateRow {
  slug: string;
  name: string;
  splitType: string;
  experience: string;
  daysPerWeek: number;
  equipment: string;
  minutesPerSession: number;
  focusAreasJson: unknown;
  daysJson: unknown;
}

interface CatalogExercise {
  exercise: Record<string, unknown>;
  templateEquipment: string;
}

interface PersonalizedWorkoutProfile extends WorkoutProfileInput {
  daysOfWeek: number[];
  location: WorkoutLocation;
  splitPreference: WorkoutSplitPreference;
  goal: WorkoutGoal;
  availableEquipment: string[];
}

const DEFAULT_WEEKDAYS: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

const SPLIT_ALIASES: Record<string, string[]> = {
  AUTO: [],
  FULL_BODY: ['FULL_BODY', 'FULLBODY'],
  AB: ['AB_2D', 'ADAPTATION_2D', 'FULL_BODY'],
  UPPER_LOWER: ['UPPER_LOWER'],
  ABC: ['ABC_', 'PPL_3D'],
  ABCD: ['ABCD'],
  ABCDE: ['ABCDE', 'PPL_5D'],
  PUSH_PULL_LEGS: ['PPL', 'PUSH_PULL_LEGS'],
  CIRCUIT: ['CONDITIONING', 'CIRCUIT', 'WEIGHT_LOSS'],
  MOBILITY: ['MOBILITY', 'RECOVERY'],
};

const GOAL_TERMS: Record<string, string[]> = {
  GENERAL_FITNESS: ['full', 'adaptation', 'geral'],
  HYPERTROPHY: ['hypertrophy', 'hipertrofia', 'abc', 'ppl', 'volume'],
  STRENGTH: ['strength', 'forca'],
  FAT_LOSS: ['weight_loss', 'conditioning', 'condicionamento', 'circuit'],
  ENDURANCE: ['conditioning', 'condicionamento', 'cardio'],
  MOBILITY: ['mobility', 'mobilidade', 'recovery'],
  LOWER_BODY: ['lower_focus', 'glute', 'posterior', 'pernas'],
};

const SPLIT_DAY_COUNTS: Record<WorkoutSplitPreference, readonly number[]> = {
  AUTO: [1, 2, 3, 4, 5, 6, 7],
  FULL_BODY: [1, 2, 3, 4],
  AB: [2],
  UPPER_LOWER: [4],
  ABC: [3, 6],
  ABCD: [4],
  ABCDE: [5],
  PUSH_PULL_LEGS: [3, 5],
  CIRCUIT: [3, 4],
  MOBILITY: [2],
};

const BODYWEIGHT_SPLITS = new Set<string>(['AUTO', 'FULL_BODY', 'AB', 'CIRCUIT', 'MOBILITY']);

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

@Injectable()
export class WorkoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workoutSafety: WorkoutSafetyService,
  ) {}

  // --- Perfil ---

  async getProfile(userId: string) {
    const profile = await this.prisma.workoutProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Perfil de treino nao configurado.');
    return serializeWorkoutProfile(profile);
  }

  assertProfileAllowed(dto: WorkoutProfileDto, locale: string) {
    const verdict = this.classifyProfile(dto);
    if (verdict === 'BLOCKED') {
      throw new UnprocessableEntityException({
        code: 'WORKOUT_BLOCKED',
        message: this.workoutSafety.blockedMessage(locale),
      });
    }
    return verdict;
  }

  classifyProfile(dto: WorkoutProfileDto) {
    return this.workoutSafety.classify(dto.healthConditions);
  }

  async upsertProfile(userId: string, dto: WorkoutProfileDto, locale = 'en') {
    this.assertProfileAllowed(dto, locale);

    const profileInput = this.personalizedProfile(dto);

    const data = {
      experience: profileInput.experience,
      daysPerWeek: profileInput.daysPerWeek,
      daysOfWeekJson: profileInput.daysOfWeek as never,
      healthConditionsJson: profileInput.healthConditions as never,
      equipment: profileInput.equipment,
      location: profileInput.location,
      splitPreference: profileInput.splitPreference,
      goal: profileInput.goal,
      availableEquipmentJson: profileInput.availableEquipment as never,
      minutesPerSession: profileInput.minutesPerSession,
    };
    const profile = await this.prisma.workoutProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return serializeWorkoutProfile(profile);
  }

  // --- Plano ---

  async getActivePlan(userId: string, locale?: string) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { userId, active: true },
      orderBy: { generatedAt: 'desc' },
    });
    if (!plan) throw new NotFoundException('Nenhum plano de treino ativo.');
    return serializeWorkoutPlan(plan, locale);
  }

  async getPlanState(userId: string, locale?: string) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { userId, active: true },
      orderBy: { generatedAt: 'desc' },
    });
    if (plan) return { httpStatus: 200, body: serializeWorkoutPlan(plan, locale) };
    throw new NotFoundException('Personalize seu treino para criar o primeiro plano.');
  }

  async replacePlan(userId: string, dto: UpdateWorkoutPlanDto) {
    const current = await this.prisma.workoutPlan.findFirst({
      where: { userId, active: true },
      orderBy: { generatedAt: 'desc' },
    });
    if (!current) throw new NotFoundException('Nenhum plano de treino ativo para atualizar.');
    const updated = await this.prisma.workoutPlan.update({
      where: { id: current.id },
      data: {
        daysJson: dto.days as never,
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.workoutProfileSnapshot !== undefined
          ? { workoutProfileSnapshotJson: dto.workoutProfileSnapshot as never }
          : {}),
      },
    });
    return serializeWorkoutPlan(updated);
  }

  async swapExercise(
    userId: string,
    dto: SwapExerciseDto,
    idempotencyKey?: string,
    locale?: string,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const requestHash = this.hash(dto);
    const replay = await this.prisma.planMutation.findUnique({
      where: {
        userId_operation_idempotencyKey: {
          userId,
          operation: 'WORKOUT_EXERCISE_SWAP',
          idempotencyKey: key,
        },
      },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'A chave de idempotencia ja foi usada com outro payload.',
        });
      }
      return locale ? localizeWorkoutPlan(replay.resultJson, locale) : replay.resultJson;
    }

    const requestedAlternative = dto.alternativeId?.trim() || dto.alternativeName?.trim();
    if (!requestedAlternative) {
      throw new BadRequestException({
        code: 'ALTERNATIVE_REQUIRED',
        message: 'Informe alternativeId.',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.workoutPlan.findFirst({ where: { id: dto.planId, userId } });
        if (!plan) throw new NotFoundException('Plano de treino nao encontrado.');
        if (!plan.active || plan.version !== dto.version) {
          const current = await tx.workoutPlan.findFirst({
            where: { userId, active: true },
            orderBy: { generatedAt: 'desc' },
          });
          throw new ConflictException({
            code: 'PLAN_VERSION_CONFLICT',
            message: 'O plano de treino foi atualizado. Recarregue antes de trocar o exercicio.',
            currentPlan: current ? serializeWorkoutPlan(current, locale) : null,
          });
        }

        const activeSession = await tx.workoutSession.findFirst({
          where: { userId, planId: plan.id, finishedAt: null },
          select: { id: true },
        });
        if (activeSession) {
          throw new ConflictException({
            code: 'ACTIVE_WORKOUT_SESSION',
            message: 'Finalize a sessao ativa antes de alterar o plano.',
          });
        }

        const snapshot = plan.workoutProfileSnapshotJson as Record<string, unknown>;
        const healthConditions = Array.isArray(snapshot.healthConditions)
          ? snapshot.healthConditions.map(String)
          : [];
        if (this.workoutSafety.classify(healthConditions) === 'BLOCKED') {
          throw new UnprocessableEntityException({
            code: 'WORKOUT_BLOCKED',
            message: this.workoutSafety.blockedMessage(locale ?? 'en'),
          });
        }

        const days = this.workoutDays(plan.daysJson);
        const day = days.find((item) => item.dayOfWeek === dto.dayOfWeek);
        const exercise = day?.exercises.find((item) => item.id === dto.exerciseId);
        if (!day || !exercise) {
          throw new BadRequestException({
            code: 'EXERCISE_NOT_IN_PLAN',
            message: 'O exercicio informado nao existe nesse dia do plano.',
          });
        }

        const allowedAlternative = exercise.alternatives
          .map((alternative) => this.alternativeReference(alternative))
          .find(
            (alternative) =>
              alternative.id === requestedAlternative ||
              normalizeText(alternative.name) === normalizeText(requestedAlternative),
          );
        if (!allowedAlternative) {
          throw new BadRequestException({
            code: 'ALTERNATIVE_NOT_AUTHORIZED',
            message: 'O exercicio nao e uma alternativa autorizada para esta posicao.',
          });
        }

        const templates = await tx.workoutTemplate.findMany({
          where: { active: true },
          orderBy: [{ createdAt: 'asc' }],
        });
        const preferredEquipment = String(snapshot.templateEquipment ?? '');
        const profileExperience = String(snapshot.experience ?? 'beginner');
        const matchingCandidates = templates
          .flatMap((template) =>
            this.templateExercises(template.daysJson).map((candidate) => ({
              candidate,
              templateEquipment: template.equipment,
            })),
          )
          .filter(
            ({ candidate, templateEquipment }) =>
              (!preferredEquipment || templateEquipment === preferredEquipment) &&
              this.matchesAlternativeReference(candidate, allowedAlternative),
          )
          .sort((a, b) => {
            const scoreA = a.templateEquipment === preferredEquipment ? 0 : 1;
            const scoreB = b.templateEquipment === preferredEquipment ? 0 : 1;
            return scoreA - scoreB;
          });
        const availableEquipment = Array.isArray(snapshot.availableEquipment)
          ? snapshot.availableEquipment.map(String).filter(Boolean)
          : [];
        const candidates = matchingCandidates.filter(({ candidate, templateEquipment }) =>
          this.isEquivalentAlternative(
            exercise,
            candidate,
            profileExperience,
            availableEquipment,
            templateEquipment,
            preferredEquipment,
          ),
        );
        const selected = candidates[0];
        if (!selected) {
          if (matchingCandidates.length === 0) {
            throw new BadRequestException({
              code: 'ALTERNATIVE_UNAVAILABLE',
              message: 'A alternativa nao esta disponivel no catalogo ativo.',
            });
          }
          throw new UnprocessableEntityException({
            code: 'ALTERNATIVE_NOT_EQUIVALENT',
            message:
              'A alternativa nao preserva grupo muscular, equipamento, categoria ou dificuldade permitidos.',
          });
        }

        const catalog = this.catalogExercises(templates as WorkoutTemplateRow[]);
        const replacement = this.normalizeExercise(selected.candidate, exercise.id);
        replacement.alternatives = this.catalogAlternatives(selected.candidate, catalog, {
          experience: profileExperience,
          availableEquipment,
          preferredTemplateEquipment: preferredEquipment,
        });
        day.exercises[day.exercises.indexOf(exercise)] = replacement;

        const updated = await tx.workoutPlan.updateMany({
          where: { id: plan.id, userId, active: true, version: dto.version },
          data: { daysJson: days as never, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ConflictException({
            code: 'PLAN_VERSION_CONFLICT',
            message: 'O plano de treino foi atualizado por outra operacao.',
          });
        }

        const canonical = await tx.workoutPlan.findUniqueOrThrow({ where: { id: plan.id } });
        const result = serializeWorkoutPlan(canonical);
        await tx.planMutation.create({
          data: {
            userId,
            operation: 'WORKOUT_EXERCISE_SWAP',
            idempotencyKey: key,
            requestHash,
            beforeJson: serializeWorkoutPlan(plan) as never,
            resultJson: result as never,
          },
        });
        return locale ? localizeWorkoutPlan(result, locale) : result;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrentReplay = await this.prisma.planMutation.findUnique({
          where: {
            userId_operation_idempotencyKey: {
              userId,
              operation: 'WORKOUT_EXERCISE_SWAP',
              idempotencyKey: key,
            },
          },
        });
        if (concurrentReplay?.requestHash === requestHash) {
          return locale
            ? localizeWorkoutPlan(concurrentReplay.resultJson, locale)
            : concurrentReplay.resultJson;
        }
      }
      throw error;
    }
  }

  async generateReadyPlan(userId: string, dto: WorkoutProfileDto, locale: string) {
    const verdict = this.assertProfileAllowed(dto, locale);

    const activeSession = await this.prisma.workoutSession.findFirst({
      where: { userId, finishedAt: null },
      select: { id: true },
    });
    if (activeSession) {
      throw new ConflictException({
        code: 'ACTIVE_WORKOUT_SESSION',
        message: 'Finalize a sessao ativa antes de personalizar o plano.',
      });
    }

    await this.upsertProfile(userId, dto, locale);
    const profile = this.personalizedProfile(dto);
    const consultMode = verdict === 'CONSULT_REQUIRED';
    const template = await this.pickWorkoutTemplate(profile, consultMode);
    const catalog = (await this.prisma.workoutTemplate.findMany({
      where: { active: true },
      orderBy: [{ createdAt: 'asc' }],
    })) as WorkoutTemplateRow[];
    const plan = await this.persistPlan(
      userId,
      { name: template.name, days: Array.isArray(template.daysJson) ? template.daysJson : [] },
      {
        ...profile,
        templateSlug: template.slug,
        splitType: template.splitType,
        templateEquipment: template.equipment,
        consultMode,
      },
      this.catalogExercises(catalog),
      profile,
    );
    return localizeWorkoutPlan(plan, locale);
  }

  async previewReadyPlan(dto: WorkoutProfileDto, locale: string) {
    const verdict = this.assertProfileAllowed(dto, locale);
    const profile = this.personalizedProfile(dto);
    const template = await this.pickWorkoutTemplate(profile, verdict === 'CONSULT_REQUIRED');
    const days = this.personalizeTemplateDays(template.daysJson, profile.daysOfWeek);
    const localized = localizeWorkoutPlan({ name: template.name, days }, locale);
    return {
      name: localized.name,
      daysPerWeek: dto.daysPerWeek,
      minutesPerSession: dto.minutesPerSession,
      days: localized.days.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        name: day.name,
        focusArea: day.focusArea,
        estimatedMinutes: day.estimatedMinutes,
        exerciseCount: day.exercises.length,
      })),
    };
  }

  // --- Sessoes ---

  async createSession(userId: string, dto: CreateSessionDto) {
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      const created = await tx.workoutSession.create({
        data: {
          userId,
          planId: dto.planId,
          workoutId: dto.workoutId,
          completedExercisesJson: [],
        },
      });
      await appendSyncChange(tx, userId, workoutSessionDraft(created), {
        occurredAt: created.startedAt,
      });
      return created;
    });
    return serializeWorkoutSession(session);
  }

  async listSessions(userId: string) {
    const sessions = await this.prisma.workoutSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return sessions.map(serializeWorkoutSession);
  }

  async getSession(userId: string, id: string) {
    const session = await this.prisma.workoutSession.findFirst({ where: { id, userId } });
    if (!session) throw new NotFoundException('Sessao nao encontrada.');
    return serializeWorkoutSession(session);
  }

  async updateSession(userId: string, id: string, dto: UpdateSessionDto) {
    const existing = await this.prisma.workoutSession.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Sessao nao encontrada.');

    const finishing = dto.finish === true || dto.finishedAt !== undefined;
    const finishedAt = dto.finishedAt
      ? new Date(dto.finishedAt)
      : finishing
        ? new Date()
        : undefined;

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      const updated = await tx.workoutSession.update({
        where: { id },
        data: {
          ...(dto.completedExercises !== undefined
            ? { completedExercisesJson: dto.completedExercises as never }
            : {}),
          ...(finishedAt ? { finishedAt } : {}),
          ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        },
      });
      await appendSyncChange(tx, userId, workoutSessionDraft(updated), {
        occurredAt: updated.finishedAt ?? updated.startedAt,
      });
      return updated;
    });
    return serializeWorkoutSession(session);
  }

  async deleteSession(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
      const existing = await tx.workoutSession.findFirst({ where: { id, userId } });
      if (!existing) throw new NotFoundException('Sessao nao encontrada.');
      await tx.workoutSession.delete({ where: { id } });
      await appendSyncChange(tx, userId, deleteSyncDraft('WORKOUT_SESSION', id));
    });
  }

  private desiredEquipment(equipment: string): 'BODYWEIGHT' | 'GYM' {
    const value = equipment
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (
      value.includes('nenhum') ||
      value.includes('casa') ||
      value.includes('peso corporal') ||
      value.includes('bodyweight')
    ) {
      return 'BODYWEIGHT';
    }
    return 'GYM';
  }

  private experienceScore(experience: string): number {
    return EXPERIENCE_SCORE[experience] ?? DEFAULT_EXPERIENCE_SCORE;
  }

  private templateScore(
    template: WorkoutTemplateRow,
    profile: PersonalizedWorkoutProfile,
    consultMode: boolean,
  ): number {
    const requestedExperience = this.experienceScore(profile.experience);
    const templateExperience = this.experienceScore(template.experience);
    const harderThanRequested = templateExperience > requestedExperience;
    const equipment = this.desiredEquipment(profile.equipment);
    const equipmentPenalty = template.equipment === equipment ? 0 : 80;
    const daysPenalty = Math.abs(template.daysPerWeek - profile.daysPerWeek) * 18;
    const experiencePenalty =
      Math.abs(templateExperience - requestedExperience) * 5 + (harderThanRequested ? 25 : 0);
    const minutesPenalty = Math.abs(template.minutesPerSession - profile.minutesPerSession) / 10;
    const consultPenalty =
      consultMode && !template.splitType.toUpperCase().includes('ADAPTATION') ? 50 : 0;

    const haystack = normalizeText(
      `${template.slug} ${template.name} ${template.splitType} ${JSON.stringify(template.focusAreasJson)}`,
    ).replace(/[^a-z0-9]+/g, '_');
    const splitTerms = SPLIT_ALIASES[profile.splitPreference] ?? [];
    const splitPenalty =
      splitTerms.length === 0 || splitTerms.some((term) => haystack.includes(term.toLowerCase()))
        ? 0
        : 45;
    const goalTerms = GOAL_TERMS[profile.goal] ?? [];
    const goalPenalty = goalTerms.some((term) => haystack.includes(normalizeText(term))) ? 0 : 14;
    const detailedEquipmentPenalty = this.detailedEquipmentPenalty(
      template.daysJson,
      profile.availableEquipment,
    );
    // Home profiles are stored as BODYWEIGHT even when the person explicitly selected bands.
    // Prefer the band-specific template only when the capability is available; otherwise the
    // compatibility filter keeps band-required movements out of a bodyweight-only plan.
    const bandPreference =
      this.hasBands(profile.availableEquipment) && this.templateRequiresBands(template.daysJson)
        ? -50
        : 0;

    return (
      equipmentPenalty +
      daysPenalty +
      experiencePenalty +
      minutesPenalty +
      consultPenalty +
      splitPenalty +
      goalPenalty +
      detailedEquipmentPenalty +
      bandPreference
    );
  }

  private hasBands(availableEquipment: string[]): boolean {
    return availableEquipment.some((item) => {
      const normalized = normalizeText(item);
      return (
        normalized === 'bands' || normalized.includes('elastico') || normalized.includes('faixa')
      );
    });
  }

  private templateRequiresBands(value: unknown): boolean {
    return this.templateExercises(value).some((exercise) =>
      (Array.isArray(exercise.equipment) ? exercise.equipment : []).some((item) => {
        const normalized = normalizeText(String(item));
        return normalized.includes('elastico') || normalized.includes('faixa');
      }),
    );
  }

  private async pickWorkoutTemplate(
    profile: PersonalizedWorkoutProfile,
    consultMode: boolean,
  ): Promise<WorkoutTemplateRow> {
    const templates = (await this.prisma.workoutTemplate.findMany({
      where: { active: true },
      orderBy: [{ daysPerWeek: 'asc' }, { createdAt: 'asc' }],
    })) as WorkoutTemplateRow[];

    if (templates.length === 0) {
      throw new NotFoundException('Catalogo fixo de treinos vazio. Rode o seed do banco.');
    }

    const compatibleTemplates = templates.filter(
      (template) =>
        this.unsupportedEquipment(template.daysJson, profile.availableEquipment).length === 0,
    );
    if (compatibleTemplates.length === 0) {
      throw new UnprocessableEntityException({
        code: 'NO_COMPATIBLE_WORKOUT_TEMPLATE',
        message: 'Nenhum treino do catalogo usa somente os equipamentos selecionados.',
      });
    }

    return [...compatibleTemplates].sort((a, b) => {
      const scoreA = this.templateScore(a, profile, consultMode);
      const scoreB = this.templateScore(b, profile, consultMode);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.name.localeCompare(b.name);
    })[0]!;
  }

  /** Normaliza o plano da IA, atribui ids estaveis aos exercicios e persiste. */
  private async persistPlan(
    userId: string,
    result: { name?: string; days?: unknown[] },
    snapshot: Record<string, unknown>,
    catalog: CatalogExercise[] = [],
    profile?: PersonalizedWorkoutProfile,
  ) {
    const requestedDays = Array.isArray(snapshot.daysOfWeek)
      ? snapshot.daysOfWeek.map(Number)
      : undefined;
    const days = requestedDays?.length
      ? this.personalizeTemplateDays(result?.days, requestedDays, catalog, profile)
      : this.normalizePlanDays(Array.isArray(result?.days) ? result.days : [], catalog, profile);

    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.workoutPlan.updateMany({
        where: { userId, active: true },
        data: { active: false },
      });
      return tx.workoutPlan.create({
        data: {
          userId,
          active: true,
          name: String(result?.name ?? 'Plano de Treino'),
          daysJson: days as never,
          workoutProfileSnapshotJson: snapshot as never,
        },
      });
    });
    return serializeWorkoutPlan(plan);
  }

  private normalizePlanDays(
    daysRaw: unknown[],
    catalog: CatalogExercise[] = [],
    profile?: PersonalizedWorkoutProfile,
  ): WorkoutDay[] {
    return daysRaw.map((dayRaw, di) => {
      const day = dayRaw as Record<string, unknown>;
      const dayOfWeek = Number(day.dayOfWeek ?? di + 1);
      const exercisesRaw = Array.isArray(day.exercises) ? day.exercises : [];
      const exercises = exercisesRaw.map((exRaw, ei) => {
        const ex = exRaw as Record<string, unknown>;
        const category = String(ex.category ?? 'STRENGTH');
        const difficulty = String(ex.difficulty ?? 'beginner');
        const normalized = this.normalizeExercise(ex, `d${dayOfWeek}-e${ei}`, category, difficulty);
        if (profile && catalog.length > 0) {
          normalized.alternatives = this.catalogAlternatives(ex, catalog, {
            experience: profile.experience,
            availableEquipment: profile.availableEquipment,
            preferredTemplateEquipment: this.desiredEquipment(profile.equipment),
          });
        }
        return normalized;
      });
      return {
        dayOfWeek,
        name: String(day.name ?? `Dia ${dayOfWeek}`),
        focusArea: String(day.focusArea ?? ''),
        estimatedMinutes: Math.round(num(day.estimatedMinutes)),
        exercises,
      };
    });
  }

  private personalizedProfile(dto: WorkoutProfileDto): PersonalizedWorkoutProfile {
    const daysPerWeek = Math.min(7, Math.max(1, Math.round(Number(dto.daysPerWeek) || 3)));
    const requestedDays = Array.isArray(dto.daysOfWeek)
      ? [...new Set(dto.daysOfWeek.map(Number).filter((day) => day >= 0 && day <= 6))]
      : [];
    if (
      Array.isArray(dto.daysOfWeek) &&
      (requestedDays.length !== dto.daysOfWeek.length || requestedDays.length !== daysPerWeek)
    ) {
      throw new BadRequestException({
        code: 'INVALID_WORKOUT_DAYS',
        message: 'Selecione dias unicos e na mesma quantidade informada para a semana.',
      });
    }
    const daysOfWeek =
      requestedDays.length === daysPerWeek
        ? requestedDays.sort((a, b) => this.weekdayOrder(a) - this.weekdayOrder(b))
        : [...(DEFAULT_WEEKDAYS[daysPerWeek] ?? DEFAULT_WEEKDAYS[3]!)];
    const location =
      dto.location ?? (this.desiredEquipment(dto.equipment) === 'GYM' ? 'GYM' : 'HOME');
    const equipment =
      location === 'HOME' || location === 'OUTDOOR' ? 'bodyweight' : dto.equipment || 'gym';
    const availableEquipment = [
      ...new Set(
        (Array.isArray(dto.availableEquipment) ? dto.availableEquipment : [])
          .map((item) => String(item).trim())
          .filter(Boolean),
      ),
    ];
    if (availableEquipment.length === 0) {
      throw new BadRequestException({
        code: 'WORKOUT_EQUIPMENT_REQUIRED',
        message: 'Selecione pelo menos um equipamento disponivel.',
      });
    }
    const splitPreference = dto.splitPreference ?? 'AUTO';
    const splitMatchesDays = SPLIT_DAY_COUNTS[splitPreference].includes(daysPerWeek);
    const splitMatchesLocation =
      (location !== 'HOME' && location !== 'OUTDOOR') || BODYWEIGHT_SPLITS.has(splitPreference);
    if (!splitMatchesDays || !splitMatchesLocation) {
      throw new BadRequestException({
        code: 'INVALID_WORKOUT_SPLIT_DAYS',
        message: 'A divisao escolhida nao combina com os dias e o local selecionados.',
      });
    }

    return {
      experience: dto.experience ?? 'beginner',
      daysPerWeek,
      daysOfWeek,
      healthConditions: Array.isArray(dto.healthConditions) ? dto.healthConditions : [],
      equipment,
      location,
      splitPreference,
      goal: dto.goal ?? 'GENERAL_FITNESS',
      availableEquipment,
      minutesPerSession: Math.min(240, Math.max(5, Number(dto.minutesPerSession) || 45)),
    };
  }

  private personalizeTemplateDays(
    value: unknown,
    requestedDays: number[],
    catalog: CatalogExercise[] = [],
    profile?: PersonalizedWorkoutProfile,
  ): WorkoutDay[] {
    const raw = Array.isArray(value) ? value : [];
    if (raw.length === 0) return [];
    const expanded = requestedDays.map((dayOfWeek, index) => {
      const source = structuredClone(raw[index % raw.length]) as Record<string, unknown>;
      return { ...source, dayOfWeek };
    });
    return this.normalizePlanDays(expanded, catalog, profile);
  }

  private weekdayOrder(day: number): number {
    return day === 0 ? 7 : day;
  }

  private detailedEquipmentPenalty(value: unknown, selected: string[]): number {
    return this.unsupportedEquipment(value, selected).length * 4;
  }

  private unsupportedEquipment(value: unknown, selected: string[]): string[] {
    if (selected.length === 0) return ['equipment-selection-required'];
    const capabilities = new Set([
      'peso corporal',
      'bodyweight',
      // A mat and a stable chair are comfort/support surfaces, not blockers for
      // otherwise bodyweight-only movements.
      'colchonete',
      'cadeira estavel',
    ]);
    const aliases: Record<string, string[]> = {
      bodyweight: ['peso corporal'],
      mat: ['colchonete'],
      bands: ['elastico', 'faixa'],
      dumbbells: ['halter', 'halteres', 'kettlebell'],
      bench: ['banco', 'banco inclinado'],
      barbell: ['barra', 'anilha'],
      machines: ['maquina', 'maquina assistida', 'leg press', 'hack', 'smith'],
      cable: ['polia', 'cabo', 'corda', 'tornozeleira'],
      cardio_machine: ['esteira', 'bicicleta', 'eliptico', 'remo', 'escada', 'simulador de escada'],
      backpack: ['mochila'],
    };
    for (const key of selected) {
      for (const alias of aliases[key] ?? []) capabilities.add(alias);
    }
    const required = this.templateExercises(value).flatMap((exercise) =>
      Array.isArray(exercise.equipment) ? exercise.equipment.map(String) : [],
    );
    return [
      ...new Set(
        required.filter((item) => {
          const normalized = normalizeText(item);
          return ![...capabilities].some(
            (capability) => normalized.includes(capability) || capability.includes(normalized),
          );
        }),
      ),
    ];
  }

  private normalizeExercise(
    ex: Record<string, unknown>,
    id: string,
    rawCategory = String(ex.category ?? 'STRENGTH'),
    rawDifficulty = String(ex.difficulty ?? 'beginner'),
  ): WorkoutExercise {
    return {
      id,
      name: String(ex.name ?? 'Exercicio'),
      category: VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'STRENGTH',
      muscleGroups: Array.isArray(ex.muscleGroups) ? ex.muscleGroups : [],
      sets: ex.sets !== undefined ? Math.round(num(ex.sets)) : undefined,
      reps: ex.reps !== undefined ? String(ex.reps) : undefined,
      durationSec: ex.durationSec !== undefined ? Math.round(num(ex.durationSec)) : undefined,
      restSec: Math.round(num(ex.restSec)),
      instructions: String(ex.instructions ?? ''),
      setup: ex.setup !== undefined ? String(ex.setup) : undefined,
      execution: ex.execution !== undefined ? String(ex.execution) : undefined,
      breathing: ex.breathing !== undefined ? String(ex.breathing) : undefined,
      tempo: ex.tempo !== undefined ? String(ex.tempo) : undefined,
      targetRpe: ex.targetRpe !== undefined ? String(ex.targetRpe) : undefined,
      progression: ex.progression !== undefined ? String(ex.progression) : undefined,
      equipment: Array.isArray(ex.equipment) ? ex.equipment : undefined,
      commonMistakes: Array.isArray(ex.commonMistakes) ? ex.commonMistakes : [],
      alternatives: Array.isArray(ex.alternatives)
        ? ex.alternatives.map((alternative) => this.alternativeReference(alternative))
        : [],
      safetyNotes: Array.isArray(ex.safetyNotes) ? ex.safetyNotes : [],
      videoUrl: ex.videoUrl !== undefined ? String(ex.videoUrl) : undefined,
      difficulty: VALID_DIFFICULTY.has(rawDifficulty) ? rawDifficulty : 'beginner',
      sourceKey: ex.key !== undefined ? String(ex.key) : undefined,
    };
  }

  private catalogExercises(templates: WorkoutTemplateRow[]): CatalogExercise[] {
    const seen = new Set<string>();
    return templates.flatMap((template) =>
      this.templateExercises(template.daysJson).flatMap((exercise) => {
        const id = this.catalogExerciseId(exercise);
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [{ exercise, templateEquipment: template.equipment }];
      }),
    );
  }

  private catalogAlternatives(
    source: Record<string, unknown>,
    catalog: CatalogExercise[],
    profile: {
      experience: string;
      availableEquipment: string[];
      preferredTemplateEquipment: string;
    },
  ): Array<{ id: string; name: string }> {
    const sourceId = this.catalogExerciseId(source);
    const references = Array.isArray(source.alternatives)
      ? source.alternatives.map((alternative) => this.alternativeReference(alternative))
      : [];
    return catalog
      .flatMap(({ exercise, templateEquipment }) => {
        const id = this.catalogExerciseId(exercise);
        if (
          !id ||
          id === sourceId ||
          !this.isEquivalentAlternative(
            source,
            exercise,
            profile.experience,
            profile.availableEquipment,
            templateEquipment,
            profile.preferredTemplateEquipment,
          )
        ) {
          return [];
        }
        return [
          {
            id,
            name: String(exercise.name ?? id),
            explicitlyReferenced: references.some((reference) =>
              this.matchesAlternativeReference(exercise, reference),
            ),
          },
        ];
      })
      .sort((a, b) => {
        if (a.explicitlyReferenced !== b.explicitlyReferenced) {
          return a.explicitlyReferenced ? -1 : 1;
        }
        return a.id.localeCompare(b.id);
      })
      .slice(0, 3)
      .map(({ id, name }) => ({ id, name }));
  }

  private isEquivalentAlternative(
    source: Pick<WorkoutExercise, 'category' | 'muscleGroups'> | Record<string, unknown>,
    candidate: Record<string, unknown>,
    profileExperience: string,
    availableEquipment: string[],
    candidateTemplateEquipment: string,
    preferredTemplateEquipment: string,
  ): boolean {
    if (String(candidate.category ?? '') !== String(source.category ?? '')) return false;
    if (
      this.experienceScore(String(candidate.difficulty ?? 'beginner')) >
      this.experienceScore(profileExperience)
    ) {
      return false;
    }
    if (!this.hasMuscleOverlap(source.muscleGroups, candidate.muscleGroups)) return false;
    if (availableEquipment.length > 0) {
      return (
        this.unsupportedEquipment([{ exercises: [candidate] }], availableEquipment).length === 0
      );
    }
    return !preferredTemplateEquipment || candidateTemplateEquipment === preferredTemplateEquipment;
  }

  private hasMuscleOverlap(source: unknown, candidate: unknown): boolean {
    if (!Array.isArray(source) || !Array.isArray(candidate)) return false;
    const sourceGroups = new Set(
      source.map((group) => normalizeText(String(group))).filter(Boolean),
    );
    return candidate.some((group) => sourceGroups.has(normalizeText(String(group))));
  }

  private matchesAlternativeReference(
    candidate: Record<string, unknown>,
    reference: { id: string; name: string },
  ): boolean {
    const candidateId = this.catalogExerciseId(candidate);
    const candidateName = String(candidate.name ?? '');
    return (
      candidateId === reference.id ||
      this.exerciseAlternativeId(candidateName) === reference.id ||
      this.alternativeNameKey(candidateName) === this.alternativeNameKey(reference.name)
    );
  }

  private catalogExerciseId(exercise: Record<string, unknown>): string {
    const key = String(exercise.key ?? '').trim();
    return key || this.exerciseAlternativeId(String(exercise.name ?? ''));
  }

  private alternativeNameKey(value: string): string {
    return normalizeText(value)
      .split(/[^a-z0-9]+/)
      .filter(
        (part) =>
          part && !['a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'na', 'no'].includes(part),
      )
      .join('-');
  }

  private alternativeReference(value: unknown): { id: string; name: string } {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const name = String(record.name ?? record.id ?? '');
      return {
        id: String(record.id ?? this.exerciseAlternativeId(name)),
        name,
      };
    }
    const name = String(value);
    return { id: this.exerciseAlternativeId(name), name };
  }

  private exerciseAlternativeId(name: string): string {
    return normalizeText(name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private templateExercises(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    return value.flatMap((day) => {
      if (!day || typeof day !== 'object') return [];
      const exercises = (day as Record<string, unknown>).exercises;
      return Array.isArray(exercises)
        ? exercises.filter(
            (exercise): exercise is Record<string, unknown> =>
              Boolean(exercise) && typeof exercise === 'object',
          )
        : [];
    });
  }

  private workoutDays(value: unknown): WorkoutDay[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Plano de treino armazenado em formato invalido.');
    }
    return structuredClone(value) as WorkoutDay[];
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

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
