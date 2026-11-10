import { Injectable } from '@nestjs/common';
import type { Glp1DoseEvent, Prisma } from '@prisma/client';
import { FREE_DOSE_MAX_MG } from '../../billing/subscription-access';
import { SubscriptionAccessService } from '../../billing/subscription-access.service';
import { SYNC_OPERATIONS } from '../sync.constants';
import type { SyncChangeDraft, SyncHandlerContext, SyncOperationHandler } from '../sync.types';
import { SyncOperationConflictError, SyncOperationRejectedError } from '../sync.types';
import {
  assertAppendOnlyMutation,
  assertExactPayload,
  assertOccurredAtWithinSyncWindow,
  optionalBoolean,
  optionalEnum,
  optionalIsoDate,
  optionalNumber,
  optionalString,
  requiredEnum,
  requiredNumber,
  requiredString,
} from './payload-validation';
import { lockSyncUser } from './daily-log-sync';
import { glp1DoseDraft, requireGlp1Scope, requireOwnedTreatment } from './glp1-sync-helpers';

const DOSE_STATUSES = ['SCHEDULED', 'TAKEN', 'MISSED', 'SKIPPED', 'CANCELLED'] as const;
const ROUTES = ['SUBCUTANEOUS', 'ORAL'] as const;
const SOURCES = ['USER', 'PRESCRIPTION', 'CLINICIAN', 'PHARMACIST', 'OTHER'] as const;
const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000;

interface ParsedDose {
  treatmentId: string;
  scheduledAt?: Date;
  reminderAt?: Date;
  takenAt?: Date;
  doseMg: number;
  status: (typeof DOSE_STATUSES)[number];
  route: (typeof ROUTES)[number];
  injectionSiteCode?: string;
  painLevel?: number;
  notes?: string;
  source: (typeof SOURCES)[number];
  confirmPossibleDuplicate: boolean;
}

@Injectable()
export class Glp1DoseCreateSyncHandler implements SyncOperationHandler {
  readonly operation = SYNC_OPERATIONS.GLP1_DOSE_CREATE;

  constructor(private readonly subscriptionAccess: SubscriptionAccessService) {}

  async execute(
    tx: Prisma.TransactionClient,
    context: SyncHandlerContext,
  ): Promise<SyncChangeDraft> {
    const { mutation, occurredAt, userId } = context;
    assertAppendOnlyMutation(mutation.baseVersion);
    assertOccurredAtWithinSyncWindow(occurredAt);
    const parsed = this.parsePayload(mutation.payload, occurredAt);

    await lockSyncUser(tx, userId);
    await requireGlp1Scope(tx, userId, 'dose');
    await requireOwnedTreatment(tx, userId, parsed.treatmentId);

    const existingByMutation = await tx.glp1DoseEvent.findUnique({
      where: { userId_clientMutationId: { userId, clientMutationId: mutation.mutationId } },
    });
    if (existingByMutation) {
      return this.resolveExisting(
        existingByMutation,
        parsed,
        userId,
        mutation.entityId,
        mutation.mutationId,
      );
    }

    const existingById = await tx.glp1DoseEvent.findUnique({ where: { id: mutation.entityId } });
    if (existingById) {
      return this.resolveExisting(
        existingById,
        parsed,
        userId,
        mutation.entityId,
        mutation.mutationId,
      );
    }

    if (parsed.injectionSiteCode) {
      const site = await tx.glp1InjectionSiteState.findUnique({
        where: { userId_siteCode: { userId, siteCode: parsed.injectionSiteCode } },
      });
      if (site?.unavailable) {
        throw new SyncOperationRejectedError(
          'INJECTION_SITE_UNAVAILABLE',
          'O local de aplicacao esta marcado como temporariamente indisponivel.',
        );
      }
    }

    const duplicate = parsed.takenAt
      ? await tx.glp1DoseEvent.findFirst({
          where: {
            userId,
            treatmentId: parsed.treatmentId,
            deletedAt: null,
            status: 'TAKEN',
            takenAt: {
              gte: new Date(parsed.takenAt.getTime() - DUPLICATE_WINDOW_MS),
              lte: new Date(parsed.takenAt.getTime() + DUPLICATE_WINDOW_MS),
            },
          },
          orderBy: { takenAt: 'desc' },
        })
      : null;
    if (duplicate && !parsed.confirmPossibleDuplicate) {
      throw new SyncOperationConflictError(
        'POSSIBLE_DUPLICATE',
        'Possivel dose duplicada encontrada. Confirme explicitamente antes de salvar.',
      );
    }

    if (!(await this.subscriptionAccess.isSubscribed(userId))) {
      if (parsed.doseMg > FREE_DOSE_MAX_MG + 1e-9) {
        throw new SyncOperationRejectedError(
          'FREE_DOSE_MAX_MG_EXCEEDED',
          `Premium necessario para doses acima de ${FREE_DOSE_MAX_MG}mg.`,
        );
      }
      if (!(await this.subscriptionAccess.consumeFreeDose(userId, tx))) {
        throw new SyncOperationRejectedError(
          'FREE_DOSE_LIMIT_REACHED',
          'Premium necessario para registrar mais de uma dose.',
        );
      }
    }

    const event = await tx.glp1DoseEvent.create({
      data: {
        id: mutation.entityId,
        userId,
        treatmentId: parsed.treatmentId,
        scheduledAt: parsed.scheduledAt,
        reminderAt: parsed.reminderAt,
        takenAt: parsed.takenAt,
        doseMg: parsed.doseMg,
        status: parsed.status,
        route: parsed.route,
        injectionSiteCode: parsed.injectionSiteCode,
        painLevel: parsed.painLevel,
        notes: parsed.notes,
        source: parsed.source,
        clientMutationId: mutation.mutationId,
        possibleDuplicateOfId: duplicate?.id,
        duplicateConfirmedAt: duplicate ? new Date() : undefined,
      },
    });
    return glp1DoseDraft(event);
  }

  private parsePayload(payload: Record<string, unknown>, occurredAt: Date): ParsedDose {
    assertExactPayload(payload, [
      'treatmentId',
      'scheduledAt',
      'reminderAt',
      'doseMg',
      'status',
      'route',
      'injectionSiteCode',
      'painLevel',
      'notes',
      'source',
      'confirmPossibleDuplicate',
    ]);
    const status = requiredEnum(payload, 'status', DOSE_STATUSES);
    const route = requiredEnum(payload, 'route', ROUTES);
    const doseMg = requiredNumber(payload, 'doseMg', 0.0001, 1000);
    if (Math.abs(doseMg * 10_000 - Math.round(doseMg * 10_000)) > 1e-8) {
      throw new SyncOperationRejectedError(
        'SYNC_PAYLOAD_INVALID',
        'doseMg deve ter no maximo quatro casas decimais.',
      );
    }
    const injectionSiteCode = optionalString(payload, 'injectionSiteCode', 64);
    if (route === 'ORAL' && injectionSiteCode) {
      throw new SyncOperationRejectedError(
        'INJECTION_SITE_NOT_ALLOWED',
        'Dose oral nao possui local de aplicacao.',
      );
    }
    return {
      treatmentId: requiredString(payload, 'treatmentId', 128),
      scheduledAt:
        optionalIsoDate(payload, 'scheduledAt') ?? (status === 'TAKEN' ? undefined : occurredAt),
      reminderAt: optionalIsoDate(payload, 'reminderAt'),
      takenAt: status === 'TAKEN' ? occurredAt : undefined,
      doseMg,
      status,
      route,
      injectionSiteCode,
      painLevel: optionalNumber(payload, 'painLevel', 0, 10, true),
      notes: optionalString(payload, 'notes', 2000, { allowEmpty: true }),
      source: optionalEnum(payload, 'source', SOURCES) ?? 'USER',
      confirmPossibleDuplicate: optionalBoolean(payload, 'confirmPossibleDuplicate') ?? false,
    };
  }

  private resolveExisting(
    event: Glp1DoseEvent,
    parsed: ParsedDose,
    userId: string,
    expectedEntityId: string,
    expectedMutationId: string,
  ): SyncChangeDraft {
    const same =
      event.id === expectedEntityId &&
      event.userId === userId &&
      event.deletedAt === null &&
      event.clientMutationId === expectedMutationId &&
      event.treatmentId === parsed.treatmentId &&
      event.doseMg.toNumber() === parsed.doseMg &&
      event.status === parsed.status &&
      event.route === parsed.route &&
      (event.takenAt?.getTime() ?? null) === (parsed.takenAt?.getTime() ?? null) &&
      (event.scheduledAt?.getTime() ?? null) === (parsed.scheduledAt?.getTime() ?? null) &&
      (event.reminderAt?.getTime() ?? null) === (parsed.reminderAt?.getTime() ?? null) &&
      event.injectionSiteCode === (parsed.injectionSiteCode ?? null) &&
      event.painLevel === (parsed.painLevel ?? null) &&
      event.notes === (parsed.notes ?? null) &&
      event.source === parsed.source &&
      Boolean(event.duplicateConfirmedAt) === parsed.confirmPossibleDuplicate;
    if (!same) {
      throw new SyncOperationConflictError(
        'SYNC_ENTITY_ID_CONFLICT',
        'A mutationId ou o identificador da dose ja esta em uso com outro conteudo.',
      );
    }
    return glp1DoseDraft(event);
  }
}
