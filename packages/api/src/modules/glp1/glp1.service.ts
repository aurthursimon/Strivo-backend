import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Glp1DoseStatus, Glp1Route, Glp1Source, Glp1TreatmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { FREE_DOSE_MAX_MG } from '../billing/subscription-access';
import { SubscriptionAccessService } from '../billing/subscription-access.service';
import {
  Glp1DoseStatusDto,
  Glp1FutureScheduleActionDto,
  Glp1RouteDto,
  Glp1SourceDto,
  MedicationMarketDto,
} from './dto';
import type {
  AcceptGlp1ConsentDto,
  CreateDoseEventDto,
  CreateDosePlanPeriodDto,
  CreateSymptomDto,
  CreateTreatmentDto,
  SetupGlp1Dto,
  TreatmentTransitionDto,
  UpdateDoseEventDto,
  UpdateSymptomDto,
  UpdateTreatmentDto,
  UpsertInjectionSiteDto,
  UpsertReminderRuleDto,
} from './dto';
import {
  serializeConsent,
  serializeDoseEvent,
  serializeDosePlanPeriod,
  serializeInjectionSite,
  serializeReminderRule,
  serializeSymptom,
  serializeTreatment,
} from './glp1.serializer';
import { buildFutureDoseSchedule, localTimeInZone, weekdayInZone } from './glp1-schedule';
import { appendSyncChange, deleteSyncDraft } from '../sync';
import { glp1DoseDraft, glp1SymptomDraft } from '../sync/handlers/glp1-sync-helpers';

const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000;
const SEVERE_SYMPTOM_THRESHOLD = 7;
const REQUIRED_SETUP_SCOPES = ['treatment', 'dose', 'symptoms'];
const DEFAULT_DOSE_REMINDER_OFFSET_MINUTES = -120;

type DbClient = Prisma.TransactionClient | PrismaService;

interface LegacyOnboardingGlp1 {
  medication: string;
  customMedication?: string;
  medicationMarket?: 'BRAZIL' | 'UNITED_STATES' | 'EUROPE' | 'ASIA' | 'INTERNATIONAL';
  medicationCountryCode?: string;
  activeIngredient?: string;
  route?: 'SUBCUTANEOUS' | 'ORAL';
  formulation?: string;
  doseMg: number;
  intervalDays: number;
  usualLocalTime?: string;
  lastDoseDate?: string;
  startedAt?: string;
  startWeightKg?: number;
  sideEffects?: string[];
  motivation?: string;
  cravingPeakDay?: number;
}

interface OnboardingGlp1Consent {
  type: string;
  version: string;
  scopes: string[];
  acceptedAt: string;
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sameInstant(value: Date | null, iso?: string): boolean {
  if (!value && !iso) return true;
  if (!value || !iso) return false;
  return value.getTime() === new Date(iso).getTime();
}

function conflict(code: string, message: string, details?: unknown) {
  return new ConflictException({ code, message, ...(details === undefined ? {} : { details }) });
}

function domainError(code: string, message: string, details?: unknown) {
  return new UnprocessableEntityException({
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

@Injectable()
export class Glp1Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  private async lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`);
  }

  async getConsent(userId: string) {
    const consent = await this.prisma.glp1Consent.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { acceptedAt: 'desc' },
    });
    return consent
      ? serializeConsent(consent)
      : {
          id: null,
          version: null,
          scopes: [],
          acceptedAt: null,
          clientAcceptedAt: null,
          revokedAt: null,
        };
  }

  async acceptConsent(userId: string, dto: AcceptGlp1ConsentDto) {
    if (!dto.accepted) {
      throw new BadRequestException({
        code: 'GLP1_CONSENT_NOT_ACCEPTED',
        message: 'O consentimento GLP-1 deve ser explicitamente aceito.',
      });
    }
    const scopes = [...new Set(dto.scopes.map((scope) => scope.trim().toLowerCase()))].filter(
      Boolean,
    );
    if (scopes.length === 0) {
      throw new BadRequestException({
        code: 'GLP1_CONSENT_SCOPES_REQUIRED',
        message: 'Informe ao menos um escopo de consentimento GLP-1.',
      });
    }
    const consent = await this.prisma.glp1Consent.create({
      data: {
        userId,
        version: dto.version,
        scopesJson: scopes,
        clientAcceptedAt: dto.acceptedAt ? new Date(dto.acceptedAt) : undefined,
      },
    });
    return serializeConsent(consent);
  }

  private async requireConsent(userId: string, scope: string, db: DbClient = this.prisma) {
    const consent = await db.glp1Consent.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { acceptedAt: 'desc' },
    });
    if (!consent) {
      throw new ForbiddenException({
        code: 'GLP1_CONSENT_REQUIRED',
        message: 'Consentimento GLP-1 necessario antes de salvar dados.',
      });
    }
    const scopes = Array.isArray(consent.scopesJson)
      ? consent.scopesJson.filter((item): item is string => typeof item === 'string')
      : [];
    if (!scopes.includes(scope)) {
      throw new ForbiddenException({
        code: 'GLP1_SCOPE_REQUIRED',
        message: `O consentimento atual nao inclui o escopo ${scope}.`,
      });
    }
    return consent;
  }

  private async treatmentOr404(userId: string, id: string, db: DbClient = this.prisma) {
    const treatment = await db.glp1Treatment.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!treatment) {
      throw new NotFoundException({
        code: 'GLP1_TREATMENT_NOT_FOUND',
        message: 'Tratamento GLP-1 nao encontrado.',
      });
    }
    return treatment;
  }

  private async createFutureDoseSchedule(
    db: DbClient,
    input: {
      userId: string;
      treatmentId: string;
      anchorAt: Date;
      intervalHours: number;
      usualLocalTime?: string | null;
      timezone: string;
      doseMg: number;
      route: Glp1Route;
      source: Glp1Source;
    },
  ): Promise<number> {
    const schedule = buildFutureDoseSchedule({
      anchorAt: input.anchorAt,
      intervalHours: input.intervalHours,
      usualLocalTime: input.usualLocalTime ?? undefined,
      timeZone: input.timezone,
    });
    if (schedule.length === 0) return 0;

    const scheduleKey = input.anchorAt.toISOString();
    const scheduledRows = schedule.map((scheduledAt, index) => ({
      userId: input.userId,
      treatmentId: input.treatmentId,
      scheduledAt,
      doseMg: input.doseMg,
      status: Glp1DoseStatus.SCHEDULED,
      route: input.route,
      source: input.source,
      clientMutationId: `schedule:${input.treatmentId}:${scheduleKey}:${index + 1}`,
    }));
    const result = await db.glp1DoseEvent.createMany({
      data: scheduledRows,
      skipDuplicates: true,
    });
    const events =
      (await db.glp1DoseEvent.findMany({
        where: {
          userId: input.userId,
          clientMutationId: { in: scheduledRows.map((row) => row.clientMutationId) },
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      })) ?? [];
    for (const event of events) {
      await appendSyncChange(db, input.userId, glp1DoseDraft(event), {
        occurredAt: event.scheduledAt ?? event.createdAt,
      });
    }
    return result.count;
  }

  private async cancelFutureDoseEvents(
    db: DbClient,
    input: { userId: string; treatmentId: string; after: Date },
  ): Promise<number> {
    const candidates =
      (await db.glp1DoseEvent.findMany({
        where: {
          userId: input.userId,
          treatmentId: input.treatmentId,
          status: 'SCHEDULED',
          scheduledAt: { gt: input.after },
          deletedAt: null,
        },
        select: { id: true },
      })) ?? [];
    const ids = candidates.map((event) => event.id);
    const result = await db.glp1DoseEvent.updateMany({
      where: {
        userId: input.userId,
        treatmentId: input.treatmentId,
        status: 'SCHEDULED',
        scheduledAt: { gt: input.after },
        deletedAt: null,
      },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    });
    if (ids.length === 0) return result?.count ?? 0;
    const updated =
      (await db.glp1DoseEvent.findMany({
        where: { id: { in: ids }, userId: input.userId },
        orderBy: { id: 'asc' },
      })) ?? [];
    for (const event of updated) {
      await appendSyncChange(db, input.userId, glp1DoseDraft(event), {
        occurredAt: event.scheduledAt ?? event.updatedAt,
      });
    }
    return result?.count ?? 0;
  }

  private async rescheduleFutureDoses(
    db: DbClient,
    input: {
      userId: string;
      treatmentId: string;
      anchorAt: Date;
      intervalDays: number;
      usualLocalTime: string;
      treatmentVersion?: number;
    },
  ): Promise<number> {
    const treatment = await this.treatmentOr404(input.userId, input.treatmentId, db);
    const intervalHours = input.intervalDays * 24;
    const updatedTreatment = await db.glp1Treatment.updateMany({
      where: {
        id: treatment.id,
        userId: input.userId,
        version: input.treatmentVersion ?? treatment.version,
        deletedAt: null,
      },
      data: {
        intervalHours,
        usualLocalTime: input.usualLocalTime,
        usualWeekday: weekdayInZone(input.anchorAt, treatment.timezone),
        version: { increment: 1 },
      },
    });
    if (updatedTreatment.count !== 1) {
      throw conflict(
        'VERSION_CONFLICT',
        'O tratamento foi alterado em outro dispositivo. Recarregue e tente novamente.',
      );
    }

    await db.glp1DosePlanPeriod.updateMany({
      where: {
        userId: input.userId,
        treatmentId: treatment.id,
        validUntil: null,
        validFrom: { lt: input.anchorAt },
      },
      data: { validUntil: input.anchorAt },
    });
    await db.glp1DosePlanPeriod.upsert({
      where: {
        treatmentId_validFrom: { treatmentId: treatment.id, validFrom: input.anchorAt },
      },
      update: {
        doseMg: treatment.currentDoseMg,
        intervalHours,
        source: treatment.source,
        notes: 'Cronograma futuro reprogramado apos registro fora da data planejada.',
      },
      create: {
        userId: input.userId,
        treatmentId: treatment.id,
        doseMg: treatment.currentDoseMg,
        intervalHours,
        validFrom: input.anchorAt,
        source: treatment.source,
        notes: 'Cronograma futuro reprogramado apos registro fora da data planejada.',
      },
    });

    await this.cancelFutureDoseEvents(db, {
      userId: input.userId,
      treatmentId: treatment.id,
      after: input.anchorAt,
    });

    return this.createFutureDoseSchedule(db, {
      userId: input.userId,
      treatmentId: treatment.id,
      anchorAt: input.anchorAt,
      intervalHours,
      usualLocalTime: input.usualLocalTime,
      timezone: treatment.timezone,
      doseMg: treatment.currentDoseMg.toNumber(),
      route: treatment.route,
      source: treatment.source,
    });
  }

  private validateTreatmentConsistency(dto: CreateTreatmentDto | UpdateTreatmentDto) {
    const brand = dto.brandName?.trim().toLowerCase();
    if (brand === 'rybelsus' && dto.route && dto.route !== 'ORAL') {
      throw domainError('GLP1_ROUTE_INCONSISTENT', 'Rybelsus deve ser registrado com via oral.');
    }
    if (
      dto.usualWeekday !== undefined &&
      dto.intervalHours !== undefined &&
      dto.intervalHours < 24
    ) {
      throw domainError(
        'GLP1_WEEKDAY_INCONSISTENT',
        'usualWeekday nao se aplica a intervalos menores que 24 horas.',
      );
    }
    if (
      dto.baselineSymptoms?.some((item) => item.trim().toLowerCase() === 'none') &&
      dto.baselineSymptoms.length > 1
    ) {
      throw domainError(
        'GLP1_SYMPTOMS_INCONSISTENT',
        'A opcao none nao pode ser combinada com outros sintomas.',
      );
    }
  }

  async listTreatments(userId: string, status?: string) {
    const normalized = status?.toUpperCase();
    if (
      normalized &&
      !Object.values(Glp1TreatmentStatus).includes(normalized as Glp1TreatmentStatus)
    ) {
      throw new BadRequestException({
        code: 'INVALID_TREATMENT_STATUS',
        message: 'Status de tratamento invalido.',
      });
    }
    const treatments = await this.prisma.glp1Treatment.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(normalized ? { status: normalized as Glp1TreatmentStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return treatments.map(serializeTreatment);
  }

  async createTreatment(userId: string, dto: CreateTreatmentDto, idempotencyKey?: string) {
    await this.requireConsent(userId, 'treatment');
    this.validateTreatmentConsistency(dto);

    const mutationId = dto.clientMutationId ?? idempotencyKey?.trim();
    if (mutationId) {
      const replay = await this.prisma.glp1Treatment.findUnique({
        where: {
          userId_clientMutationId: { userId, clientMutationId: mutationId },
        },
      });
      if (replay) {
        const samePayload =
          replay.activeIngredient === dto.activeIngredient.trim() &&
          replay.route === dto.route &&
          replay.currentDoseMg.toNumber() === dto.currentDoseMg &&
          replay.intervalHours.toNumber() === dto.intervalHours &&
          replay.timezone === dto.timezone &&
          (replay.medicationMarket ?? null) === (dto.medicationMarket ?? null) &&
          (replay.medicationCountryCode ?? null) === (dto.medicationCountryCode ?? null);
        if (!samePayload) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'A chave de idempotencia ja foi usada com outro tratamento.',
          );
        }
        return serializeTreatment(replay);
      }
    }

    const treatment = await this.prisma.$transaction(async (tx) => {
      if ((dto.status ?? 'ACTIVE') === 'ACTIVE') {
        await tx.glp1Treatment.updateMany({
          where: { userId, status: 'ACTIVE', deletedAt: null },
          data: { status: 'PAUSED', pausedAt: new Date(), version: { increment: 1 } },
        });
      }
      const created = await tx.glp1Treatment.create({
        data: {
          userId,
          activeIngredient: dto.activeIngredient.trim(),
          brandName: dto.brandName?.trim(),
          route: dto.route as Glp1Route,
          formulation: dto.formulation?.trim(),
          medicationMarket: dto.medicationMarket,
          medicationCountryCode: dto.medicationCountryCode,
          currentDoseMg: dto.currentDoseMg,
          intervalHours: dto.intervalHours,
          usualWeekday: dto.usualWeekday,
          usualLocalTime: dto.usualLocalTime,
          timezone: dto.timezone,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
          status: (dto.status ?? 'ACTIVE') as Glp1TreatmentStatus,
          source: (dto.source ?? 'USER') as Glp1Source,
          sourceReference: dto.sourceReference,
          notes: dto.notes,
          startWeightKg: dto.startWeightKg,
          baselineSymptomsJson: dto.baselineSymptoms as Prisma.InputJsonValue | undefined,
          motivation: dto.motivation,
          cravingPeakDay: dto.cravingPeakDay,
          clientMutationId: mutationId,
        },
      });
      await tx.glp1DosePlanPeriod.create({
        data: {
          userId,
          treatmentId: created.id,
          doseMg: dto.currentDoseMg,
          intervalHours: dto.intervalHours,
          validFrom: dto.startedAt ? new Date(dto.startedAt) : new Date(),
          source: (dto.source ?? 'USER') as Glp1Source,
          notes: 'Periodo inicial criado com o tratamento.',
        },
      });
      await tx.glp1ReminderRule.create({
        data: {
          userId,
          treatmentId: created.id,
          eventType: 'dose',
          offsetMinutes: DEFAULT_DOSE_REMINDER_OFFSET_MINUTES,
          enabled: true,
          channel: 'local',
          timezone: created.timezone,
          clientMutationId: `default-dose-reminder:${created.id}`,
        },
      });
      return created;
    });
    return serializeTreatment(treatment);
  }

  async updateTreatment(userId: string, id: string, dto: UpdateTreatmentDto) {
    await this.requireConsent(userId, 'treatment');
    this.validateTreatmentConsistency(dto);
    const existing = await this.treatmentOr404(userId, id);
    const expectedVersion = dto.version ?? existing.version;
    const nextStatus = dto.status as Glp1TreatmentStatus | undefined;
    const doseChanged =
      (dto.currentDoseMg !== undefined &&
        dto.currentDoseMg !== existing.currentDoseMg.toNumber()) ||
      (dto.intervalHours !== undefined && dto.intervalHours !== existing.intervalHours.toNumber());
    const scheduleChanged =
      doseChanged ||
      (dto.usualLocalTime !== undefined && dto.usualLocalTime !== existing.usualLocalTime) ||
      (dto.timezone !== undefined && dto.timezone !== existing.timezone);

    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      if (nextStatus === 'ACTIVE' && existing.status !== 'ACTIVE') {
        await tx.glp1Treatment.updateMany({
          where: { userId, status: 'ACTIVE', deletedAt: null, id: { not: id } },
          data: { status: 'PAUSED', pausedAt: new Date(), version: { increment: 1 } },
        });
      }
      const result = await tx.glp1Treatment.updateMany({
        where: { id, userId, version: expectedVersion, deletedAt: null },
        data: {
          activeIngredient: dto.activeIngredient?.trim(),
          brandName: dto.brandName?.trim(),
          route: dto.route as Glp1Route | undefined,
          formulation: dto.formulation?.trim(),
          medicationMarket: dto.medicationMarket,
          medicationCountryCode: dto.medicationCountryCode,
          currentDoseMg: dto.currentDoseMg,
          intervalHours: dto.intervalHours,
          usualWeekday: dto.usualWeekday,
          usualLocalTime: dto.usualLocalTime,
          timezone: dto.timezone,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
          status: nextStatus,
          source: dto.source as Glp1Source | undefined,
          sourceReference: dto.sourceReference,
          notes: dto.notes,
          startWeightKg: dto.startWeightKg,
          baselineSymptomsJson: dto.baselineSymptoms as Prisma.InputJsonValue | undefined,
          motivation: dto.motivation,
          cravingPeakDay: dto.cravingPeakDay,
          pausedAt:
            nextStatus === 'PAUSED' ? new Date() : nextStatus === 'ACTIVE' ? null : undefined,
          endedAt: nextStatus === 'COMPLETED' ? new Date() : undefined,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw conflict(
          'VERSION_CONFLICT',
          'O tratamento foi alterado em outro dispositivo. Recarregue e tente novamente.',
        );
      }
      if (doseChanged) {
        const validFrom = new Date();
        await tx.glp1DosePlanPeriod.updateMany({
          where: { userId, treatmentId: id, validUntil: null, validFrom: { lt: validFrom } },
          data: { validUntil: validFrom },
        });
        await tx.glp1DosePlanPeriod.create({
          data: {
            userId,
            treatmentId: id,
            doseMg: dto.currentDoseMg ?? existing.currentDoseMg,
            intervalHours: dto.intervalHours ?? existing.intervalHours,
            validFrom,
            source: (dto.source ?? existing.source) as Glp1Source,
            notes: 'Periodo criado por atualizacao do tratamento.',
          },
        });
      }
      if (scheduleChanged && (nextStatus ?? existing.status) === 'ACTIVE') {
        const anchorAt = new Date();
        await this.cancelFutureDoseEvents(tx, {
          userId,
          treatmentId: id,
          after: anchorAt,
        });
        await this.createFutureDoseSchedule(tx, {
          userId,
          treatmentId: id,
          anchorAt,
          intervalHours: dto.intervalHours ?? existing.intervalHours.toNumber(),
          usualLocalTime: dto.usualLocalTime ?? existing.usualLocalTime,
          timezone: dto.timezone ?? existing.timezone,
          doseMg: dto.currentDoseMg ?? existing.currentDoseMg.toNumber(),
          route: (dto.route ?? existing.route) as Glp1Route,
          source: (dto.source ?? existing.source) as Glp1Source,
        });
      }
    });
    return serializeTreatment(await this.treatmentOr404(userId, id));
  }

  async transitionTreatment(
    userId: string,
    id: string,
    target: Glp1TreatmentStatus,
    dto: TreatmentTransitionDto,
  ) {
    await this.requireConsent(userId, 'treatment');
    const existing = await this.treatmentOr404(userId, id);
    if (existing.status === target) return serializeTreatment(existing);
    if (existing.status === 'COMPLETED') {
      throw conflict(
        'INVALID_TREATMENT_TRANSITION',
        'Tratamento concluido nao pode mudar de estado.',
      );
    }
    if (target === 'ACTIVE' && existing.status !== 'PAUSED') {
      throw conflict(
        'INVALID_TREATMENT_TRANSITION',
        'Somente tratamento pausado pode ser retomado.',
      );
    }

    const expectedVersion = dto.version ?? existing.version;
    await this.prisma.$transaction(async (tx) => {
      if (target === 'ACTIVE') {
        await tx.glp1Treatment.updateMany({
          where: { userId, status: 'ACTIVE', deletedAt: null, id: { not: id } },
          data: { status: 'PAUSED', pausedAt: new Date(), version: { increment: 1 } },
        });
      }
      const updated = await tx.glp1Treatment.updateMany({
        where: { id, userId, version: expectedVersion, deletedAt: null },
        data: {
          status: target,
          pausedAt: target === 'PAUSED' ? new Date() : target === 'ACTIVE' ? null : undefined,
          endedAt: target === 'COMPLETED' ? new Date() : undefined,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw conflict('VERSION_CONFLICT', 'O tratamento foi atualizado em outro dispositivo.');
      }
    });
    return serializeTreatment(await this.treatmentOr404(userId, id));
  }

  async listDosePlanPeriods(userId: string, treatmentId: string) {
    if (!treatmentId) {
      throw new BadRequestException({
        code: 'TREATMENT_ID_REQUIRED',
        message: 'treatmentId e obrigatorio.',
      });
    }
    await this.treatmentOr404(userId, treatmentId);
    const periods = await this.prisma.glp1DosePlanPeriod.findMany({
      where: { userId, treatmentId },
      orderBy: { validFrom: 'asc' },
    });
    return periods.map(serializeDosePlanPeriod);
  }

  async createDosePlanPeriod(userId: string, dto: CreateDosePlanPeriodDto) {
    await this.requireConsent(userId, 'dose');
    const validFrom = new Date(dto.validFrom);
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validUntil && validUntil <= validFrom) {
      throw domainError('INVALID_PERIOD_RANGE', 'validUntil deve ser posterior a validFrom.');
    }

    const period = await this.prisma.$transaction(async (tx) => {
      await this.treatmentOr404(userId, dto.treatmentId, tx);
      const future = await tx.glp1DosePlanPeriod.findFirst({
        where: { userId, treatmentId: dto.treatmentId, validFrom: { gte: validFrom } },
      });
      if (future) {
        throw conflict('DOSE_PERIOD_OVERLAP', 'Ja existe um periodo de dose a partir desta data.', {
          periodId: future.id,
        });
      }
      await tx.glp1DosePlanPeriod.updateMany({
        where: {
          userId,
          treatmentId: dto.treatmentId,
          validUntil: null,
          validFrom: { lt: validFrom },
        },
        data: { validUntil: validFrom },
      });
      return tx.glp1DosePlanPeriod.create({
        data: {
          userId,
          treatmentId: dto.treatmentId,
          doseMg: dto.doseMg,
          intervalHours: dto.intervalHours,
          validFrom,
          validUntil,
          source: (dto.source ?? 'USER') as Glp1Source,
          notes: dto.notes,
        },
      });
    });
    return serializeDosePlanPeriod(period);
  }

  async listDoseEvents(userId: string, treatmentId?: string, limit = 1000) {
    if (treatmentId) await this.treatmentOr404(userId, treatmentId);
    const events = await this.prisma.glp1DoseEvent.findMany({
      where: { userId, deletedAt: null, ...(treatmentId ? { treatmentId } : {}) },
      orderBy: [{ takenAt: 'desc' }, { scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(limit, 1), 1000),
    });
    return events.map(serializeDoseEvent);
  }

  private async validateInjectionSite(
    userId: string,
    siteCode?: string,
    db: DbClient = this.prisma,
  ) {
    if (!siteCode) return;
    const state = await db.glp1InjectionSiteState.findUnique({
      where: { userId_siteCode: { userId, siteCode } },
    });
    if (state?.unavailable) {
      throw domainError(
        'INJECTION_SITE_UNAVAILABLE',
        'O local de aplicacao esta marcado como temporariamente indisponivel.',
        { siteCode },
      );
    }
  }

  private async findPossibleDuplicate(
    userId: string,
    treatmentId: string,
    eventAt: Date | undefined,
    excludeId?: string,
    db: DbClient = this.prisma,
  ) {
    if (!eventAt) return null;
    return db.glp1DoseEvent.findFirst({
      where: {
        userId,
        treatmentId,
        deletedAt: null,
        status: 'TAKEN',
        id: excludeId ? { not: excludeId } : undefined,
        takenAt: {
          gte: new Date(eventAt.getTime() - DUPLICATE_WINDOW_MS),
          lte: new Date(eventAt.getTime() + DUPLICATE_WINDOW_MS),
        },
      },
      orderBy: { takenAt: 'desc' },
    });
  }

  async createDoseEvent(userId: string, dto: CreateDoseEventDto, idempotencyKey?: string) {
    await this.requireConsent(userId, 'dose');
    const mutationId = dto.clientMutationId ?? idempotencyKey?.trim();
    if (mutationId) {
      const replay = await this.prisma.glp1DoseEvent.findUnique({
        where: {
          userId_clientMutationId: { userId, clientMutationId: mutationId },
        },
      });
      if (replay) {
        const samePayload =
          replay.treatmentId === dto.treatmentId &&
          replay.doseMg.toNumber() === dto.doseMg &&
          replay.status === dto.status &&
          replay.route === dto.route &&
          sameInstant(replay.takenAt, dto.takenAt);
        if (!samePayload) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'A chave de idempotencia ja foi usada com outro evento de dose.',
          );
        }
        return serializeDoseEvent(replay);
      }
    }
    await this.treatmentOr404(userId, dto.treatmentId);
    const injectionSiteCode = dto.injectionSiteCode ?? dto.injectionSite ?? dto.siteCode;
    await this.validateInjectionSite(userId, injectionSiteCode);
    if (dto.route === 'ORAL' && injectionSiteCode) {
      throw domainError('INJECTION_SITE_NOT_ALLOWED', 'Dose oral nao possui local de aplicacao.');
    }
    const takenAt = dto.takenAt ? new Date(dto.takenAt) : undefined;
    if (dto.status === 'TAKEN' && !takenAt) {
      throw domainError('TAKEN_AT_REQUIRED', 'takenAt e obrigatorio para uma dose tomada.');
    }
    if (
      dto.futureScheduleAction === Glp1FutureScheduleActionDto.RESCHEDULE &&
      (!takenAt || !dto.futureIntervalDays || !dto.futureLocalTime)
    ) {
      throw domainError(
        'FUTURE_SCHEDULE_REQUIRED',
        'Informe o intervalo em dias e o horario para reprogramar as doses futuras.',
      );
    }
    const duplicate =
      dto.status === 'TAKEN'
        ? await this.findPossibleDuplicate(userId, dto.treatmentId, takenAt)
        : null;
    if (duplicate && !dto.confirmPossibleDuplicate) {
      throw conflict('POSSIBLE_DUPLICATE', 'Possivel dose duplicada encontrada.', {
        candidate: serializeDoseEvent(duplicate),
      });
    }

    const event = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      if (!(await this.subscriptionAccess.isSubscribed(userId))) {
        if (dto.doseMg > FREE_DOSE_MAX_MG + 1e-9) {
          throw domainError(
            'FREE_DOSE_MAX_MG_EXCEEDED',
            `Premium necessario para doses acima de ${FREE_DOSE_MAX_MG}mg.`,
          );
        }
        if (!(await this.subscriptionAccess.consumeFreeDose(userId, tx))) {
          throw domainError(
            'FREE_DOSE_LIMIT_REACHED',
            'Premium necessario para registrar mais de uma dose.',
          );
        }
      }
      const created = await tx.glp1DoseEvent.create({
        data: {
          userId,
          treatmentId: dto.treatmentId,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : undefined,
          takenAt,
          doseMg: dto.doseMg,
          status: dto.status as Glp1DoseStatus,
          route: dto.route as Glp1Route,
          injectionSiteCode,
          painLevel: dto.painLevel ?? dto.pain,
          notes: dto.notes,
          source: (dto.source ?? 'USER') as Glp1Source,
          clientMutationId: mutationId,
          possibleDuplicateOfId: duplicate?.id,
          duplicateConfirmedAt: duplicate ? new Date() : undefined,
        },
      });
      if (dto.futureScheduleAction === Glp1FutureScheduleActionDto.RESCHEDULE && takenAt) {
        await this.rescheduleFutureDoses(tx, {
          userId,
          treatmentId: dto.treatmentId,
          anchorAt: takenAt,
          intervalDays: dto.futureIntervalDays!,
          usualLocalTime: dto.futureLocalTime!,
          treatmentVersion: dto.treatmentVersion,
        });
      }
      await appendSyncChange(tx, userId, glp1DoseDraft(created), {
        occurredAt: created.takenAt ?? created.scheduledAt ?? created.createdAt,
      });
      return created;
    });
    return serializeDoseEvent(event);
  }

  private async doseEventOr404(userId: string, id: string) {
    const event = await this.prisma.glp1DoseEvent.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!event) {
      throw new NotFoundException({
        code: 'DOSE_EVENT_NOT_FOUND',
        message: 'Evento de dose nao encontrado.',
      });
    }
    return event;
  }

  async updateDoseEvent(userId: string, id: string, dto: UpdateDoseEventDto) {
    await this.requireConsent(userId, 'dose');
    const mutationId = dto.clientMutationId?.trim();
    if (mutationId) {
      const replay = await this.prisma.glp1DoseEvent.findUnique({
        where: { userId_clientMutationId: { userId, clientMutationId: mutationId } },
      });
      if (replay) {
        const samePayload =
          replay.id === id &&
          (dto.treatmentId === undefined || replay.treatmentId === dto.treatmentId) &&
          (dto.doseMg === undefined || replay.doseMg.toNumber() === dto.doseMg) &&
          (dto.status === undefined || replay.status === dto.status) &&
          (dto.takenAt === undefined || sameInstant(replay.takenAt, dto.takenAt));
        if (!samePayload) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'A chave de idempotencia ja foi usada com outra atualizacao de dose.',
          );
        }
        return serializeDoseEvent(replay);
      }
    }
    const existing = await this.doseEventOr404(userId, id);
    const treatmentId = dto.treatmentId ?? existing.treatmentId;
    await this.treatmentOr404(userId, treatmentId);
    const route = (dto.route ?? existing.route) as Glp1Route;
    const requestedSite = dto.injectionSiteCode ?? dto.injectionSite ?? dto.siteCode;
    const site = requestedSite ?? existing.injectionSiteCode ?? undefined;
    await this.validateInjectionSite(userId, site);
    if (route === 'ORAL' && site) {
      throw domainError('INJECTION_SITE_NOT_ALLOWED', 'Dose oral nao possui local de aplicacao.');
    }
    const status = (dto.status ?? existing.status) as Glp1DoseStatus;
    const takenAt = dto.takenAt ? new Date(dto.takenAt) : (existing.takenAt ?? undefined);
    if (status === 'TAKEN' && !takenAt) {
      throw domainError('TAKEN_AT_REQUIRED', 'takenAt e obrigatorio para uma dose tomada.');
    }
    if (
      dto.futureScheduleAction === Glp1FutureScheduleActionDto.RESCHEDULE &&
      (!takenAt || !dto.futureIntervalDays || !dto.futureLocalTime)
    ) {
      throw domainError(
        'FUTURE_SCHEDULE_REQUIRED',
        'Informe o intervalo em dias e o horario para reprogramar as doses futuras.',
      );
    }
    const duplicate =
      status === 'TAKEN'
        ? await this.findPossibleDuplicate(userId, treatmentId, takenAt, id)
        : null;
    if (duplicate && !dto.confirmPossibleDuplicate) {
      throw conflict('POSSIBLE_DUPLICATE', 'Possivel dose duplicada encontrada.', {
        candidate: serializeDoseEvent(duplicate),
      });
    }

    const updatedEvent = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const updated = await tx.glp1DoseEvent.updateMany({
        where: { id, userId, deletedAt: null, version: dto.version ?? existing.version },
        data: {
          treatmentId,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : undefined,
          takenAt,
          doseMg: dto.doseMg,
          status,
          route,
          injectionSiteCode: requestedSite,
          painLevel: dto.painLevel ?? dto.pain,
          notes: dto.notes,
          source: dto.source as Glp1Source | undefined,
          clientMutationId: mutationId,
          possibleDuplicateOfId: duplicate?.id,
          duplicateConfirmedAt: duplicate ? new Date() : undefined,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw conflict('VERSION_CONFLICT', 'O evento de dose foi atualizado em outro dispositivo.');
      }
      if (dto.futureScheduleAction === Glp1FutureScheduleActionDto.RESCHEDULE && takenAt) {
        await this.rescheduleFutureDoses(tx, {
          userId,
          treatmentId,
          anchorAt: takenAt,
          intervalDays: dto.futureIntervalDays!,
          usualLocalTime: dto.futureLocalTime!,
          treatmentVersion: dto.treatmentVersion,
        });
      }
      const persisted = await tx.glp1DoseEvent.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!persisted) {
        throw new NotFoundException({
          code: 'DOSE_EVENT_NOT_FOUND',
          message: 'Evento de dose nao encontrado.',
        });
      }
      await appendSyncChange(tx, userId, glp1DoseDraft(persisted), {
        occurredAt: persisted.takenAt ?? persisted.scheduledAt ?? persisted.updatedAt,
      });
      return persisted;
    });
    return serializeDoseEvent(updatedEvent);
  }

  async transitionDoseEvent(userId: string, id: string, status: 'MISSED' | 'SKIPPED') {
    await this.requireConsent(userId, 'dose');
    const existing = await this.doseEventOr404(userId, id);
    if (existing.status === status) return serializeDoseEvent(existing);
    if (existing.status === 'TAKEN') {
      throw conflict('INVALID_DOSE_TRANSITION', 'Dose tomada nao pode ser marcada como perdida.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const persisted = await tx.glp1DoseEvent.update({
        where: { id },
        data: { status, version: { increment: 1 } },
      });
      await appendSyncChange(tx, userId, glp1DoseDraft(persisted), {
        occurredAt: persisted.takenAt ?? persisted.scheduledAt ?? persisted.updatedAt,
      });
      return persisted;
    });
    return serializeDoseEvent(updated);
  }

  async deleteDoseEvent(userId: string, id: string) {
    await this.requireConsent(userId, 'dose');
    const existing = await this.prisma.glp1DoseEvent.findFirst({ where: { id, userId } });
    if (!existing || existing.deletedAt) return;
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const deleted = await tx.glp1DoseEvent.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await appendSyncChange(tx, userId, deleteSyncDraft('GLP1_DOSE_EVENT', id, deleted.version));
    });
  }

  async listSymptoms(userId: string, treatmentId?: string, limit = 100) {
    if (treatmentId) await this.treatmentOr404(userId, treatmentId);
    const symptoms = await this.prisma.glp1SymptomEvent.findMany({
      where: { userId, deletedAt: null, ...(treatmentId ? { treatmentId } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return symptoms.map(serializeSymptom);
  }

  private validateSymptomSafety(dto: CreateSymptomDto | UpdateSymptomDto, severity: number) {
    if (severity >= SEVERE_SYMPTOM_THRESHOLD) {
      if (!dto.acknowledged || !dto.safetyContentVersion) {
        throw domainError(
          'SAFETY_ACKNOWLEDGEMENT_REQUIRED',
          'Sintomas de severidade alta exigem confirmacao do conteudo de seguranca.',
          { minimumSeverity: SEVERE_SYMPTOM_THRESHOLD },
        );
      }
    }
    if (dto.endedAt && new Date(dto.endedAt) < new Date(dto.occurredAt ?? 0)) {
      throw domainError('INVALID_SYMPTOM_RANGE', 'endedAt deve ser posterior a occurredAt.');
    }
  }

  private async symptomOr404(userId: string, id: string) {
    const symptom = await this.prisma.glp1SymptomEvent.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!symptom) {
      throw new NotFoundException({
        code: 'SYMPTOM_NOT_FOUND',
        message: 'Sintoma nao encontrado.',
      });
    }
    return symptom;
  }

  private async validateRelatedDoseEvents(userId: string, treatmentId: string, ids?: string[]) {
    if (!ids?.length) return;
    const count = await this.prisma.glp1DoseEvent.count({
      where: { id: { in: ids }, userId, treatmentId, deletedAt: null },
    });
    if (count !== new Set(ids).size) {
      throw new NotFoundException({
        code: 'RELATED_DOSE_EVENT_NOT_FOUND',
        message: 'Um evento de dose relacionado nao foi encontrado.',
      });
    }
  }

  async createSymptom(userId: string, dto: CreateSymptomDto, idempotencyKey?: string) {
    await this.requireConsent(userId, 'symptoms');
    const mutationId = dto.clientMutationId ?? idempotencyKey?.trim();
    if (mutationId) {
      const replay = await this.prisma.glp1SymptomEvent.findUnique({
        where: {
          userId_clientMutationId: { userId, clientMutationId: mutationId },
        },
      });
      if (replay) {
        const samePayload =
          replay.treatmentId === dto.treatmentId &&
          replay.code === dto.code &&
          replay.severity === dto.severity &&
          sameInstant(replay.occurredAt, dto.occurredAt);
        if (!samePayload) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'A chave de idempotencia ja foi usada com outro sintoma.',
          );
        }
        return serializeSymptom(replay);
      }
    }
    await this.treatmentOr404(userId, dto.treatmentId);
    this.validateSymptomSafety(dto, dto.severity);
    await this.validateRelatedDoseEvents(userId, dto.treatmentId, dto.relatedDoseEventIds);
    const symptom = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const created = await tx.glp1SymptomEvent.create({
        data: {
          userId,
          treatmentId: dto.treatmentId,
          code: dto.code,
          customName: dto.customName,
          severity: dto.severity,
          occurredAt: new Date(dto.occurredAt),
          endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
          durationMinutes: dto.durationMinutes,
          notes: dto.notes,
          relatedDoseEventIdsJson: dto.relatedDoseEventIds as Prisma.InputJsonValue | undefined,
          acknowledgedAt: dto.acknowledged ? new Date() : undefined,
          safetyContentVersion: dto.safetyContentVersion,
          clientMutationId: mutationId,
        },
      });
      await appendSyncChange(tx, userId, glp1SymptomDraft(created), {
        occurredAt: created.occurredAt,
      });
      return created;
    });
    return serializeSymptom(symptom);
  }

  async updateSymptom(userId: string, id: string, dto: UpdateSymptomDto) {
    await this.requireConsent(userId, 'symptoms');
    const existing = await this.symptomOr404(userId, id);
    const treatmentId = dto.treatmentId ?? existing.treatmentId;
    const severity = dto.severity ?? existing.severity;
    const merged = {
      ...dto,
      occurredAt: dto.occurredAt ?? existing.occurredAt.toISOString(),
      acknowledged: dto.acknowledged ?? Boolean(existing.acknowledgedAt),
      safetyContentVersion: dto.safetyContentVersion ?? existing.safetyContentVersion ?? undefined,
    };
    await this.treatmentOr404(userId, treatmentId);
    this.validateSymptomSafety(merged, severity);
    await this.validateRelatedDoseEvents(userId, treatmentId, dto.relatedDoseEventIds);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const result = await tx.glp1SymptomEvent.updateMany({
        where: { id, userId, deletedAt: null, version: dto.version ?? existing.version },
        data: {
          treatmentId,
          code: dto.code,
          customName: dto.customName,
          severity,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
          endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
          durationMinutes: dto.durationMinutes,
          notes: dto.notes,
          relatedDoseEventIdsJson: dto.relatedDoseEventIds as Prisma.InputJsonValue | undefined,
          acknowledgedAt: dto.acknowledged ? new Date() : undefined,
          safetyContentVersion: dto.safetyContentVersion,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw conflict('VERSION_CONFLICT', 'O sintoma foi atualizado em outro dispositivo.');
      }
      const persisted = await tx.glp1SymptomEvent.findUnique({ where: { id } });
      if (!persisted) {
        throw new NotFoundException({
          code: 'SYMPTOM_NOT_FOUND',
          message: 'Sintoma nao encontrado.',
        });
      }
      await appendSyncChange(tx, userId, glp1SymptomDraft(persisted), {
        occurredAt: persisted.occurredAt,
      });
      return persisted;
    });
    return serializeSymptom(updated);
  }

  async deleteSymptom(userId: string, id: string) {
    await this.requireConsent(userId, 'symptoms');
    const existing = await this.prisma.glp1SymptomEvent.findFirst({ where: { id, userId } });
    if (!existing || existing.deletedAt) return;
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const deleted = await tx.glp1SymptomEvent.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await appendSyncChange(
        tx,
        userId,
        deleteSyncDraft('GLP1_SYMPTOM_EVENT', id, deleted.version),
      );
    });
  }

  async listReminderRules(userId: string, treatmentId?: string) {
    if (treatmentId) {
      const treatment = await this.treatmentOr404(userId, treatmentId);
      const existingDoseRule = await this.prisma.glp1ReminderRule.findFirst({
        where: { userId, treatmentId, eventType: 'dose', channel: 'local' },
      });
      if (!existingDoseRule) {
        await this.prisma.glp1ReminderRule.upsert({
          where: {
            userId_treatmentId_eventType_offsetMinutes_channel: {
              userId,
              treatmentId,
              eventType: 'dose',
              offsetMinutes: DEFAULT_DOSE_REMINDER_OFFSET_MINUTES,
              channel: 'local',
            },
          },
          create: {
            userId,
            treatmentId,
            eventType: 'dose',
            offsetMinutes: DEFAULT_DOSE_REMINDER_OFFSET_MINUTES,
            enabled: true,
            channel: 'local',
            timezone: treatment.timezone,
            clientMutationId: `default-dose-reminder:${treatmentId}`,
          },
          update: {},
        });
      }
    }
    const rules = await this.prisma.glp1ReminderRule.findMany({
      where: { userId, ...(treatmentId ? { treatmentId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    return rules.map(serializeReminderRule);
  }

  async upsertReminderRule(userId: string, dto: UpsertReminderRuleDto) {
    await this.requireConsent(userId, 'treatment');
    await this.treatmentOr404(userId, dto.treatmentId);
    if (dto.id) {
      const existing = await this.prisma.glp1ReminderRule.findFirst({
        where: { id: dto.id, userId },
      });
      if (!existing) {
        throw new NotFoundException({
          code: 'REMINDER_RULE_NOT_FOUND',
          message: 'Regra de lembrete nao encontrada.',
        });
      }
      const updated = await this.prisma.glp1ReminderRule.update({
        where: { id: dto.id },
        data: {
          treatmentId: dto.treatmentId,
          eventType: dto.eventType,
          offsetMinutes: dto.offsetMinutes,
          enabled: dto.enabled,
          channel: dto.channel ?? 'local',
          timezone: dto.timezone,
          clientMutationId: dto.clientMutationId,
          version: { increment: 1 },
        },
      });
      return serializeReminderRule(updated);
    }
    const rule = await this.prisma.glp1ReminderRule.upsert({
      where: {
        userId_treatmentId_eventType_offsetMinutes_channel: {
          userId,
          treatmentId: dto.treatmentId,
          eventType: dto.eventType,
          offsetMinutes: dto.offsetMinutes,
          channel: dto.channel ?? 'local',
        },
      },
      create: {
        userId,
        treatmentId: dto.treatmentId,
        eventType: dto.eventType,
        offsetMinutes: dto.offsetMinutes,
        enabled: dto.enabled,
        channel: dto.channel ?? 'local',
        timezone: dto.timezone,
        clientMutationId: dto.clientMutationId,
      },
      update: {
        enabled: dto.enabled,
        timezone: dto.timezone,
        clientMutationId: dto.clientMutationId,
        version: { increment: 1 },
      },
    });
    return serializeReminderRule(rule);
  }

  async listInjectionSites(userId: string) {
    const sites = await this.prisma.glp1InjectionSiteState.findMany({
      where: { userId },
      orderBy: { siteCode: 'asc' },
    });
    return sites.map(serializeInjectionSite);
  }

  async upsertInjectionSite(userId: string, dto: UpsertInjectionSiteDto) {
    await this.requireConsent(userId, 'dose');
    const site = await this.prisma.glp1InjectionSiteState.upsert({
      where: { userId_siteCode: { userId, siteCode: dto.siteCode } },
      create: { userId, siteCode: dto.siteCode, unavailable: dto.unavailable, notes: dto.notes },
      update: {
        unavailable: dto.unavailable,
        notes: dto.notes,
        version: { increment: 1 },
      },
    });
    return serializeInjectionSite(site);
  }

  async setup(userId: string, dto: SetupGlp1Dto, idempotencyKey?: string) {
    if (!dto.consent.accepted) {
      throw new BadRequestException({
        code: 'GLP1_CONSENT_NOT_ACCEPTED',
        message: 'O consentimento GLP-1 deve ser aceito no setup.',
      });
    }
    const normalizedScopes = dto.consent.scopes.map((scope) => scope.toLowerCase());
    const missingScopes = REQUIRED_SETUP_SCOPES.filter(
      (scope) => !normalizedScopes.includes(scope),
    );
    if (missingScopes.length) {
      throw domainError('GLP1_SETUP_SCOPES_REQUIRED', 'O setup exige os escopos basicos.', {
        missingScopes,
      });
    }
    this.validateTreatmentConsistency(dto.treatment);
    if (
      dto.period?.validUntil &&
      new Date(dto.period.validUntil) <=
        new Date(dto.period.validFrom ?? dto.treatment.startedAt ?? Date.now())
    ) {
      throw domainError('INVALID_PERIOD_RANGE', 'validUntil deve ser posterior a validFrom.');
    }
    const setupInjectionSite =
      dto.doseEvent?.injectionSiteCode ?? dto.doseEvent?.injectionSite ?? dto.doseEvent?.siteCode;
    if (dto.doseEvent?.route === 'ORAL' && setupInjectionSite) {
      throw domainError('INJECTION_SITE_NOT_ALLOWED', 'Dose oral nao possui local de aplicacao.');
    }
    const requestHash = hashPayload(dto);
    const key = idempotencyKey?.trim() || `payload:${requestHash}`;
    const replay = await this.prisma.glp1SetupSubmission.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw conflict(
          'IDEMPOTENCY_KEY_REUSED',
          'A chave de idempotencia ja foi usada com outro payload.',
        );
      }
      return replay.resultJson;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockUser(tx, userId);
        const consent = await tx.glp1Consent.create({
          data: {
            userId,
            version: dto.consent.version,
            scopesJson: normalizedScopes,
            clientAcceptedAt: dto.consent.acceptedAt ? new Date(dto.consent.acceptedAt) : undefined,
          },
        });
        if ((dto.treatment.status ?? 'ACTIVE') === 'ACTIVE') {
          await tx.glp1Treatment.updateMany({
            where: { userId, status: 'ACTIVE', deletedAt: null },
            data: { status: 'PAUSED', pausedAt: new Date(), version: { increment: 1 } },
          });
        }
        const treatment = await tx.glp1Treatment.create({
          data: {
            userId,
            activeIngredient: dto.treatment.activeIngredient.trim(),
            brandName: dto.treatment.brandName?.trim(),
            route: dto.treatment.route as Glp1Route,
            formulation: dto.treatment.formulation?.trim(),
            medicationMarket: dto.treatment.medicationMarket,
            medicationCountryCode: dto.treatment.medicationCountryCode,
            currentDoseMg: dto.treatment.currentDoseMg,
            intervalHours: dto.treatment.intervalHours,
            usualWeekday: dto.treatment.usualWeekday,
            usualLocalTime: dto.treatment.usualLocalTime,
            timezone: dto.treatment.timezone,
            startedAt: dto.treatment.startedAt ? new Date(dto.treatment.startedAt) : undefined,
            status: (dto.treatment.status ?? 'ACTIVE') as Glp1TreatmentStatus,
            source: (dto.treatment.source ?? 'USER') as Glp1Source,
            sourceReference: dto.treatment.sourceReference,
            notes: dto.treatment.notes,
            startWeightKg: dto.treatment.startWeightKg,
            baselineSymptomsJson: dto.treatment.baselineSymptoms as
              | Prisma.InputJsonValue
              | undefined,
            motivation: dto.treatment.motivation,
            cravingPeakDay: dto.treatment.cravingPeakDay,
            clientMutationId: dto.treatment.clientMutationId,
          },
        });
        const validFrom = dto.period?.validFrom
          ? new Date(dto.period.validFrom)
          : (treatment.startedAt ?? new Date());
        const period = await tx.glp1DosePlanPeriod.create({
          data: {
            userId,
            treatmentId: treatment.id,
            doseMg: dto.period?.doseMg ?? dto.treatment.currentDoseMg,
            intervalHours: dto.period?.intervalHours ?? dto.treatment.intervalHours,
            validFrom,
            validUntil: dto.period?.validUntil ? new Date(dto.period.validUntil) : undefined,
            source: (dto.period?.source ?? dto.treatment.source ?? 'USER') as Glp1Source,
            notes: dto.period?.notes,
          },
        });
        await tx.glp1ReminderRule.create({
          data: {
            userId,
            treatmentId: treatment.id,
            eventType: 'dose',
            offsetMinutes: DEFAULT_DOSE_REMINDER_OFFSET_MINUTES,
            enabled: true,
            channel: 'local',
            timezone: treatment.timezone,
            clientMutationId: `default-dose-reminder:${treatment.id}`,
          },
        });

        let doseEvent = null;
        // Onboarding is a single all-or-nothing setup transaction (consent +
        // treatment + period + optional first dose event), and the treatment
        // profile itself (currentDoseMg, used for display/scheduling) is set
        // above regardless of this block. A free user's real-world current
        // dose can legitimately be above 2.5mg or a repeat - failing the
        // ENTIRE onboarding submission over that would look like a broken
        // app, not an intentional limit. So this one call site is lenient:
        // skip logging the initial dose-taken journal entry rather than
        // rejecting the request. Every other dose-creation path (schedule
        // screen, edit dialog) enforces normally and shows a real paywall.
        const canLogInitialDose =
          !dto.doseEvent ||
          (await this.subscriptionAccess.isSubscribed(userId)) ||
          (dto.doseEvent.doseMg <= FREE_DOSE_MAX_MG + 1e-9 &&
            (await this.subscriptionAccess.consumeFreeDose(userId, tx)));
        if (dto.doseEvent && canLogInitialDose) {
          await this.validateInjectionSite(userId, setupInjectionSite, tx);
          const takenAt = dto.doseEvent.takenAt ? new Date(dto.doseEvent.takenAt) : undefined;
          if (dto.doseEvent.status === 'TAKEN' && !takenAt) {
            throw domainError('TAKEN_AT_REQUIRED', 'takenAt e obrigatorio para uma dose tomada.');
          }
          doseEvent = await tx.glp1DoseEvent.create({
            data: {
              userId,
              treatmentId: treatment.id,
              scheduledAt: dto.doseEvent.scheduledAt
                ? new Date(dto.doseEvent.scheduledAt)
                : undefined,
              reminderAt: dto.doseEvent.reminderAt ? new Date(dto.doseEvent.reminderAt) : undefined,
              takenAt,
              doseMg: dto.doseEvent.doseMg,
              status: dto.doseEvent.status as Glp1DoseStatus,
              route: dto.doseEvent.route as Glp1Route,
              injectionSiteCode: setupInjectionSite,
              painLevel: dto.doseEvent.painLevel ?? dto.doseEvent.pain,
              notes: dto.doseEvent.notes,
              source: (dto.doseEvent.source ?? 'USER') as Glp1Source,
              clientMutationId: dto.doseEvent.clientMutationId,
            },
          });
          await appendSyncChange(tx, userId, glp1DoseDraft(doseEvent), {
            occurredAt: doseEvent.takenAt ?? doseEvent.scheduledAt ?? doseEvent.createdAt,
          });
        }

        const scheduleAnchor = doseEvent?.takenAt ?? doseEvent?.scheduledAt;
        if (scheduleAnchor && treatment.status === 'ACTIVE') {
          await this.createFutureDoseSchedule(tx, {
            userId,
            treatmentId: treatment.id,
            anchorAt: scheduleAnchor,
            intervalHours: period.intervalHours.toNumber(),
            usualLocalTime: treatment.usualLocalTime,
            timezone: treatment.timezone,
            doseMg: period.doseMg.toNumber(),
            route: treatment.route,
            source: period.source,
          });
        }

        const result = {
          consent: serializeConsent(consent),
          treatment: serializeTreatment(treatment),
          period: serializeDosePlanPeriod(period),
          doseEvent: doseEvent ? serializeDoseEvent(doseEvent) : null,
        };
        const jsonResult = asJson(result);
        await tx.glp1SetupSubmission.create({
          data: {
            userId,
            idempotencyKey: key,
            requestHash,
            resultJson: jsonResult,
          },
        });
        return jsonResult;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrentReplay = await this.prisma.glp1SetupSubmission.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
        });
        if (concurrentReplay?.requestHash === requestHash) return concurrentReplay.resultJson;
        if (concurrentReplay) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'A chave de idempotencia ja foi usada com outro payload.',
          );
        }
      }
      throw error;
    }
  }

  async setupFromOnboarding(
    userId: string,
    glp1: LegacyOnboardingGlp1,
    timezone = 'UTC',
    consent?: OnboardingGlp1Consent,
  ) {
    if (!consent || consent.type.trim().toLowerCase() !== 'glp1_tracking') {
      throw domainError(
        'GLP1_CONSENT_REQUIRED',
        'O onboarding com GLP-1 exige consentimento versionado e explicito.',
        { missingFields: ['consents[type=glp1_tracking]'] },
      );
    }
    const medication = glp1.medication.trim();
    const normalized = medication.toLowerCase();
    const ingredientByBrand: Record<string, string> = {
      ozempic: 'semaglutide',
      wegovy: 'semaglutide',
      rybelsus: 'semaglutide',
      mounjaro: 'tirzepatide',
      zepbound: 'tirzepatide',
      saxenda: 'liraglutide',
      victoza: 'liraglutide',
      trulicity: 'dulaglutide',
    };
    const knownIngredient = ingredientByBrand[normalized];
    if (!knownIngredient && (!glp1.activeIngredient || !glp1.route)) {
      throw domainError(
        'GLP1_CUSTOM_MEDICATION_REQUIRES_INPUT',
        'Medicamento personalizado exige principio ativo e via confirmados.',
        { missingFields: ['glp1.activeIngredient', 'glp1.route'] },
      );
    }
    const activeIngredient = knownIngredient ?? glp1.activeIngredient!;
    const brandName = knownIngredient ? medication : (glp1.customMedication ?? medication);
    const route = glp1.route
      ? glp1.route === 'ORAL'
        ? Glp1RouteDto.ORAL
        : Glp1RouteDto.SUBCUTANEOUS
      : normalized === 'rybelsus'
        ? Glp1RouteDto.ORAL
        : Glp1RouteDto.SUBCUTANEOUS;
    const hasExactLastDoseTime = Boolean(glp1.lastDoseDate?.includes('T'));
    const baselineSymptoms = glp1.sideEffects?.some((item) => item.trim().toLowerCase() === 'none')
      ? ['none']
      : glp1.sideEffects;
    const setupDto: SetupGlp1Dto = {
      consent: {
        accepted: true,
        version: consent.version,
        scopes: consent.scopes,
        acceptedAt: consent.acceptedAt,
      },
      treatment: {
        activeIngredient,
        brandName,
        route,
        formulation: glp1.formulation,
        medicationMarket: glp1.medicationMarket as MedicationMarketDto | undefined,
        medicationCountryCode: glp1.medicationCountryCode,
        currentDoseMg: glp1.doseMg,
        intervalHours: glp1.intervalDays * 24,
        usualWeekday: glp1.lastDoseDate
          ? weekdayInZone(new Date(glp1.lastDoseDate), timezone)
          : undefined,
        usualLocalTime:
          glp1.usualLocalTime ??
          (glp1.lastDoseDate ? localTimeInZone(new Date(glp1.lastDoseDate), timezone) : undefined),
        timezone,
        startedAt: glp1.startedAt,
        source: Glp1SourceDto.USER,
        notes:
          timezone === 'UTC'
            ? 'Importado do onboarding V1; timezone e horario habitual ainda nao confirmados.'
            : undefined,
        startWeightKg: glp1.startWeightKg,
        baselineSymptoms,
        motivation: glp1.motivation,
        cravingPeakDay: glp1.cravingPeakDay,
      },
      period: {
        doseMg: glp1.doseMg,
        intervalHours: glp1.intervalDays * 24,
        validFrom: glp1.startedAt ?? new Date().toISOString(),
        source: Glp1SourceDto.USER,
      },
      doseEvent: hasExactLastDoseTime
        ? {
            doseMg: glp1.doseMg,
            status: Glp1DoseStatusDto.TAKEN,
            route,
            scheduledAt: glp1.lastDoseDate,
            takenAt: glp1.lastDoseDate,
            source: Glp1SourceDto.USER,
          }
        : undefined,
    };
    const result = await this.setup(
      userId,
      setupDto,
      `onboarding:${hashPayload({ glp1, consent })}`,
    );
    const treatmentId = (result as { treatment?: { id?: unknown } } | null)?.treatment?.id;
    const doseEvents =
      typeof treatmentId === 'string' ? await this.listDoseEvents(userId, treatmentId) : [];
    return {
      ...((result as Record<string, unknown>) ?? {}),
      doseEvents,
      warnings: [
        ...(timezone === 'UTC' ? ['TIMEZONE_NOT_CONFIRMED'] : []),
        ...(glp1.lastDoseDate && !hasExactLastDoseTime ? ['LAST_DOSE_TIME_REQUIRED'] : []),
      ],
    };
  }

  async timeline(userId: string, treatmentId?: string, limit = 1000) {
    if (treatmentId) await this.treatmentOr404(userId, treatmentId);
    const take = Math.min(Math.max(limit, 1), 1000);
    const [doses, symptoms, periods] = await Promise.all([
      this.prisma.glp1DoseEvent.findMany({
        where: { userId, deletedAt: null, ...(treatmentId ? { treatmentId } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.glp1SymptomEvent.findMany({
        where: { userId, deletedAt: null, ...(treatmentId ? { treatmentId } : {}) },
        orderBy: { occurredAt: 'desc' },
        take,
      }),
      this.prisma.glp1DosePlanPeriod.findMany({
        where: { userId, ...(treatmentId ? { treatmentId } : {}) },
        orderBy: { validFrom: 'desc' },
        take,
      }),
    ]);
    return [
      ...doses.map((dose) => ({
        id: dose.id,
        type: 'dose',
        occurredAt: dose.takenAt ?? dose.scheduledAt ?? dose.createdAt,
        data: serializeDoseEvent(dose),
      })),
      ...symptoms.map((symptom) => ({
        id: symptom.id,
        type: 'symptom',
        occurredAt: symptom.occurredAt,
        data: serializeSymptom(symptom),
      })),
      ...periods.map((period) => ({
        id: period.id,
        type: 'dose_plan_period',
        occurredAt: period.validFrom,
        data: serializeDosePlanPeriod(period),
      })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, take);
  }
}
