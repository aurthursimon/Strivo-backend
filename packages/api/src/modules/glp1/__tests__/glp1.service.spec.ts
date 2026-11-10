import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Glp1Service } from '../glp1.service';
import { PrismaService } from '../../../prisma';
import { SubscriptionAccessService } from '../../billing/subscription-access.service';

// These tests exercise dose-event domain logic, not free-tier gating, so
// stub the user as already subscribed - that short-circuits before
// consumeFreeDose ever touches mockPrisma.
const mockSubscriptionAccess = {
  isSubscribed: jest.fn().mockResolvedValue(true),
  consumeFreeDose: jest.fn().mockResolvedValue(true),
};

const now = new Date('2026-07-21T12:00:00Z');

const treatment = (overrides: Record<string, unknown> = {}) => ({
  id: 'tr-1',
  userId: 'u-1',
  activeIngredient: 'tirzepatide',
  brandName: 'Mounjaro',
  route: 'SUBCUTANEOUS',
  formulation: 'pen',
  currentDoseMg: { toNumber: () => 2.5 },
  intervalHours: { toNumber: () => 168 },
  usualWeekday: 1,
  usualLocalTime: '08:00',
  timezone: 'America/Sao_Paulo',
  startedAt: now,
  endedAt: null,
  pausedAt: null,
  status: 'ACTIVE',
  source: 'PRESCRIPTION',
  sourceReference: null,
  notes: null,
  startWeightKg: null,
  baselineSymptomsJson: [],
  motivation: null,
  cravingPeakDay: null,
  clientMutationId: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

const doseEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'dose-1',
  userId: 'u-1',
  treatmentId: 'tr-1',
  scheduledAt: null,
  reminderAt: null,
  takenAt: now,
  doseMg: { toNumber: () => 2.5 },
  status: 'TAKEN',
  route: 'SUBCUTANEOUS',
  injectionSiteCode: 'abdomen_left',
  painLevel: 1,
  notes: null,
  source: 'USER',
  clientMutationId: null,
  possibleDuplicateOfId: null,
  duplicateConfirmedAt: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

const symptom = (overrides: Record<string, unknown> = {}) => ({
  id: 'sym-1',
  userId: 'u-1',
  treatmentId: 'tr-1',
  code: 'nausea',
  customName: null,
  severity: 4,
  occurredAt: now,
  endedAt: null,
  durationMinutes: null,
  notes: null,
  relatedDoseEventIdsJson: [],
  acknowledgedAt: null,
  safetyContentVersion: null,
  clientMutationId: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

const period = (overrides: Record<string, unknown> = {}) => ({
  id: 'period-1',
  userId: 'u-1',
  treatmentId: 'tr-1',
  doseMg: { toNumber: () => 2.5 },
  intervalHours: { toNumber: () => 168 },
  validFrom: now,
  validUntil: null,
  source: 'PRESCRIPTION',
  notes: null,
  createdAt: now,
  ...overrides,
});

const consent = (overrides: Record<string, unknown> = {}) => ({
  id: 'consent-1',
  userId: 'u-1',
  version: '1.0.0',
  scopesJson: ['treatment', 'dose', 'symptoms', 'exposure'],
  acceptedAt: now,
  clientAcceptedAt: now,
  revokedAt: null,
  source: 'user',
  createdAt: now,
  ...overrides,
});

const mockPrisma = {
  $queryRaw: jest.fn(),
  glp1Consent: { findFirst: jest.fn(), create: jest.fn() },
  glp1Treatment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  glp1DosePlanPeriod: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
  },
  glp1DoseEvent: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  glp1SymptomEvent: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  glp1ReminderRule: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  glp1InjectionSiteState: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  glp1SetupSubmission: { findUnique: jest.fn(), create: jest.fn() },
  syncChange: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('Glp1Service', () => {
  let service: Glp1Service;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        Glp1Service,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubscriptionAccessService, useValue: mockSubscriptionAccess },
      ],
    }).compile();
    service = module.get(Glp1Service);
    jest.clearAllMocks();
    mockSubscriptionAccess.isSubscribed.mockResolvedValue(true);
    mockSubscriptionAccess.consumeFreeDose.mockResolvedValue(true);
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'u-1' }]);
    mockPrisma.glp1Consent.findFirst.mockResolvedValue(consent());
    mockPrisma.glp1Treatment.findFirst.mockResolvedValue(treatment());
    mockPrisma.glp1ReminderRule.findFirst.mockResolvedValue({ id: 'reminder-1' });
    mockPrisma.glp1InjectionSiteState.findUnique.mockResolvedValue(null);
    mockPrisma.glp1DoseEvent.createMany.mockResolvedValue({ count: 53 });
    mockPrisma.glp1DoseEvent.findMany.mockResolvedValue([]);
  });

  it('retorna ausencia de consentimento de forma explicita', async () => {
    mockPrisma.glp1Consent.findFirst.mockResolvedValue(null);
    await expect(service.getConsent('u-1')).resolves.toEqual({
      id: null,
      version: null,
      scopes: [],
      acceptedAt: null,
      clientAcceptedAt: null,
      revokedAt: null,
    });
  });

  it('nao aceita consentimento false', async () => {
    await expect(
      service.acceptConsent('u-1', { accepted: false, version: '1', scopes: ['treatment'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia escrita sem consentimento', async () => {
    mockPrisma.glp1Consent.findFirst.mockResolvedValue(null);
    await expect(
      service.createTreatment('u-1', {
        activeIngredient: 'tirzepatide',
        route: 'SUBCUTANEOUS',
        currentDoseMg: 2.5,
        intervalHours: 168,
        timezone: 'America/Sao_Paulo',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reexecuta create de tratamento por clientMutationId sem duplicar', async () => {
    mockPrisma.glp1Treatment.findUnique.mockResolvedValue(treatment());
    const result = await service.createTreatment('u-1', {
      activeIngredient: 'tirzepatide',
      route: 'SUBCUTANEOUS',
      currentDoseMg: 2.5,
      intervalHours: 168,
      timezone: 'America/Sao_Paulo',
      clientMutationId: 'cm-1',
    } as never);
    expect(result.id).toBe('tr-1');
    expect(mockPrisma.glp1Treatment.create).not.toHaveBeenCalled();
  });

  it('pausa o tratamento ativo ao criar outro ativo', async () => {
    mockPrisma.glp1Treatment.findUnique.mockResolvedValue(null);
    mockPrisma.glp1Treatment.create.mockResolvedValue(treatment({ id: 'tr-2' }));
    await service.createTreatment('u-1', {
      activeIngredient: 'tirzepatide',
      route: 'SUBCUTANEOUS',
      currentDoseMg: 5,
      intervalHours: 168,
      timezone: 'America/Sao_Paulo',
    } as never);
    expect(mockPrisma.glp1Treatment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
    );
    expect(mockPrisma.glp1ReminderRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enabled: true,
        eventType: 'dose',
        offsetMinutes: -120,
        treatmentId: 'tr-2',
      }),
    });
  });

  it('materializa lembrete de dose padrao para tratamento antigo sem regra', async () => {
    mockPrisma.glp1ReminderRule.findFirst.mockResolvedValue(null);
    mockPrisma.glp1ReminderRule.findMany.mockResolvedValue([]);

    await service.listReminderRules('u-1', 'tr-1');

    expect(mockPrisma.glp1ReminderRule.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        enabled: true,
        eventType: 'dose',
        offsetMinutes: -120,
        treatmentId: 'tr-1',
      }),
      update: {},
      where: expect.any(Object),
    });
  });

  it('rejeita via incompativel com Rybelsus', async () => {
    await expect(
      service.createTreatment('u-1', {
        activeIngredient: 'semaglutide',
        brandName: 'Rybelsus',
        route: 'SUBCUTANEOUS',
        currentDoseMg: 3,
        intervalHours: 24,
        timezone: 'America/Sao_Paulo',
      } as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('nao permite periodo de dose sobreposto', async () => {
    mockPrisma.glp1DosePlanPeriod.findFirst.mockResolvedValue(period());
    await expect(
      service.createDosePlanPeriod('u-1', {
        treatmentId: 'tr-1',
        doseMg: 5,
        intervalHours: 168,
        validFrom: '2026-07-21T12:00:00Z',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cria novo periodo ao alterar dose do tratamento', async () => {
    mockPrisma.glp1Treatment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.glp1DosePlanPeriod.create.mockResolvedValue(period({ doseMg: 5 }));
    await service.updateTreatment('u-1', 'tr-1', { currentDoseMg: 5, version: 1 } as never);
    expect(mockPrisma.glp1DosePlanPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ treatmentId: 'tr-1' }) }),
    );
    expect(mockPrisma.glp1DosePlanPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ doseMg: 5 }) }),
    );
  });

  it('pausa tratamento de forma versionada', async () => {
    mockPrisma.glp1Treatment.findFirst
      .mockResolvedValueOnce(treatment())
      .mockResolvedValueOnce(treatment({ status: 'PAUSED', pausedAt: now, version: 2 }));
    mockPrisma.glp1Treatment.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.transitionTreatment('u-1', 'tr-1', 'PAUSED', { version: 1 });
    expect(result.status).toBe('paused');
    expect(mockPrisma.glp1Treatment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'tr-1', version: 1 }),
        data: expect.objectContaining({ status: 'PAUSED' }),
      }),
    );
  });

  it('exige takenAt para evento TAKEN', async () => {
    await expect(
      service.createDoseEvent('u-1', {
        treatmentId: 'tr-1',
        doseMg: 2.5,
        status: 'TAKEN',
        route: 'SUBCUTANEOUS',
      } as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('retorna candidato ao detectar possivel dose duplicada', async () => {
    mockPrisma.glp1DoseEvent.findFirst.mockResolvedValue(doseEvent());
    await expect(
      service.createDoseEvent('u-1', {
        treatmentId: 'tr-1',
        doseMg: 2.5,
        status: 'TAKEN',
        route: 'SUBCUTANEOUS',
        takenAt: '2026-07-21T12:30:00Z',
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'POSSIBLE_DUPLICATE' }),
    });
  });

  it('salva confirmacao explicita de possivel duplicidade', async () => {
    mockPrisma.glp1DoseEvent.findFirst.mockResolvedValue(doseEvent());
    mockPrisma.glp1DoseEvent.create.mockResolvedValue(
      doseEvent({
        id: 'dose-2',
        possibleDuplicateOfId: 'dose-1',
        duplicateConfirmedAt: now,
      }),
    );
    const result = await service.createDoseEvent('u-1', {
      treatmentId: 'tr-1',
      doseMg: 2.5,
      status: 'TAKEN',
      route: 'SUBCUTANEOUS',
      takenAt: '2026-07-21T12:30:00Z',
      confirmPossibleDuplicate: true,
    } as never);
    expect(result.possibleDuplicateOfId).toBe('dose-1');
    expect(mockPrisma.glp1DoseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          possibleDuplicateOfId: 'dose-1',
          duplicateConfirmedAt: expect.any(Date),
        }),
      }),
    );
    expect(mockPrisma.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-1',
        entityType: 'GLP1_DOSE_EVENT',
        entityId: 'dose-2',
        action: 'UPSERT',
      }),
    });
  });

  it('exige premium para uma dose acima de 2.5mg de um usuario free', async () => {
    mockSubscriptionAccess.isSubscribed.mockResolvedValue(false);
    mockPrisma.glp1DoseEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.createDoseEvent('u-1', {
        treatmentId: 'tr-1',
        doseMg: 5,
        status: 'TAKEN',
        route: 'SUBCUTANEOUS',
        takenAt: '2026-07-21T12:30:00Z',
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FREE_DOSE_MAX_MG_EXCEEDED' }),
    });
    expect(mockPrisma.glp1DoseEvent.create).not.toHaveBeenCalled();
    expect(mockSubscriptionAccess.consumeFreeDose).not.toHaveBeenCalled();
  });

  it('exige premium para uma segunda dose de 2.5mg de um usuario free', async () => {
    mockSubscriptionAccess.isSubscribed.mockResolvedValue(false);
    mockSubscriptionAccess.consumeFreeDose.mockResolvedValue(false);
    mockPrisma.glp1DoseEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.createDoseEvent('u-1', {
        treatmentId: 'tr-1',
        doseMg: 2.5,
        status: 'TAKEN',
        route: 'SUBCUTANEOUS',
        takenAt: '2026-07-21T12:30:00Z',
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FREE_DOSE_LIMIT_REACHED' }),
    });
    expect(mockPrisma.glp1DoseEvent.create).not.toHaveBeenCalled();
  });

  it('permite a primeira dose gratuita de 2.5mg e consome o free tier', async () => {
    mockSubscriptionAccess.isSubscribed.mockResolvedValue(false);
    mockSubscriptionAccess.consumeFreeDose.mockResolvedValue(true);
    mockPrisma.glp1DoseEvent.findFirst.mockResolvedValue(null);
    mockPrisma.glp1DoseEvent.create.mockResolvedValue(doseEvent());

    await service.createDoseEvent('u-1', {
      treatmentId: 'tr-1',
      doseMg: 2.5,
      status: 'TAKEN',
      route: 'SUBCUTANEOUS',
      takenAt: '2026-07-21T12:30:00Z',
    } as never);

    expect(mockSubscriptionAccess.consumeFreeDose).toHaveBeenCalledWith('u-1', mockPrisma);
    expect(mockPrisma.glp1DoseEvent.create).toHaveBeenCalled();
  });

  it('publica tombstone ao excluir um evento de dose', async () => {
    mockPrisma.glp1DoseEvent.findFirst.mockResolvedValue(doseEvent());
    mockPrisma.glp1DoseEvent.update.mockResolvedValue(doseEvent({ version: 2, deletedAt: now }));

    await service.deleteDoseEvent('u-1', 'dose-1');

    expect(mockPrisma.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-1',
        entityType: 'GLP1_DOSE_EVENT',
        entityId: 'dose-1',
        action: 'DELETE',
        version: 2,
      }),
    });
  });

  it('mantem a dose historica separada e recalcula o futuro ao registrar fora do plano', async () => {
    const takenAt = new Date('2026-07-10T14:00:00Z');
    mockPrisma.glp1DoseEvent.findFirst.mockResolvedValue(null);
    mockPrisma.glp1DoseEvent.create.mockResolvedValue(
      doseEvent({ id: 'historical-dose', scheduledAt: null, takenAt }),
    );
    mockPrisma.glp1Treatment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.glp1DosePlanPeriod.upsert.mockResolvedValue(period({ validFrom: takenAt }));

    const result = await service.createDoseEvent('u-1', {
      treatmentId: 'tr-1',
      doseMg: 2.5,
      status: 'TAKEN',
      route: 'SUBCUTANEOUS',
      takenAt: takenAt.toISOString(),
      injectionSiteCode: 'abdomen_left',
      futureScheduleAction: 'RESCHEDULE',
      futureIntervalDays: 7,
      futureLocalTime: '08:00',
      treatmentVersion: 1,
    } as never);

    expect(result.id).toBe('historical-dose');
    expect(mockPrisma.glp1DoseEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scheduledAt: undefined, takenAt }),
      }),
    );
    expect(mockPrisma.glp1DoseEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(mockPrisma.glp1DoseEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ status: 'SCHEDULED' })]),
      }),
    );
  });

  it('reprograma um ano de doses futuras a partir de uma dose fora da data', async () => {
    const planned = doseEvent({
      status: 'SCHEDULED',
      takenAt: null,
      scheduledAt: new Date('2026-07-21T11:00:00Z'),
    });
    const recorded = doseEvent({
      status: 'TAKEN',
      takenAt: new Date('2026-07-23T14:00:00Z'),
      scheduledAt: new Date('2026-07-21T11:00:00Z'),
      version: 2,
    });
    mockPrisma.glp1DoseEvent.findFirst
      .mockResolvedValueOnce(planned)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(recorded);
    mockPrisma.glp1DoseEvent.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.glp1Treatment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.glp1DosePlanPeriod.upsert.mockResolvedValue(period());

    await service.updateDoseEvent('u-1', 'dose-1', {
      treatmentId: 'tr-1',
      takenAt: '2026-07-23T14:00:00Z',
      status: 'TAKEN',
      futureScheduleAction: 'RESCHEDULE',
      futureIntervalDays: 7,
      futureLocalTime: '08:00',
      treatmentVersion: 1,
      version: 1,
    } as never);

    expect(mockPrisma.glp1Treatment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ intervalHours: 168, usualLocalTime: '08:00' }),
      }),
    );
    expect(mockPrisma.glp1DoseEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(mockPrisma.glp1DoseEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ status: 'SCHEDULED' })]),
      }),
    );
  });

  it('reexecuta atualizacao de dose pela chave idempotente sem aplicar o cronograma duas vezes', async () => {
    const replay = doseEvent({
      status: 'TAKEN',
      takenAt: new Date('2026-07-23T14:00:00Z'),
      clientMutationId: 'dose-update-1',
      version: 2,
    });
    mockPrisma.glp1DoseEvent.findUnique.mockResolvedValue(replay);

    const result = await service.updateDoseEvent('u-1', 'dose-1', {
      takenAt: '2026-07-23T14:00:00Z',
      doseMg: 2.5,
      status: 'TAKEN',
      clientMutationId: 'dose-update-1',
      version: 1,
    } as never);

    expect(result.version).toBe(2);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.glp1DoseEvent.createMany).not.toHaveBeenCalled();
  });

  it('mantem o cronograma intacto quando o usuario escolhe manter as datas futuras', async () => {
    const planned = doseEvent({ status: 'SCHEDULED', takenAt: null, scheduledAt: now });
    const recorded = doseEvent({ status: 'TAKEN', takenAt: now, scheduledAt: now, version: 2 });
    mockPrisma.glp1DoseEvent.findFirst
      .mockResolvedValueOnce(planned)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(recorded);
    mockPrisma.glp1DoseEvent.updateMany.mockResolvedValue({ count: 1 });

    await service.updateDoseEvent('u-1', 'dose-1', {
      takenAt: now.toISOString(),
      status: 'TAKEN',
      futureScheduleAction: 'KEEP',
      version: 1,
    } as never);

    expect(mockPrisma.glp1Treatment.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.glp1DosePlanPeriod.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.glp1DoseEvent.createMany).not.toHaveBeenCalled();
  });

  it('permite limpar as observacoes de uma dose com texto vazio', async () => {
    const existing = doseEvent({ notes: 'Observacao anterior' });
    const updated = doseEvent({ notes: '', version: 2 });
    mockPrisma.glp1DoseEvent.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(updated);
    mockPrisma.glp1DoseEvent.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.updateDoseEvent('u-1', 'dose-1', {
      notes: '',
      version: 1,
    } as never);

    expect(mockPrisma.glp1DoseEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: '' }) }),
    );
    expect(result.notes).toBe('');
  });

  it('interrompe o reagendamento quando a versao do tratamento ficou desatualizada', async () => {
    const planned = doseEvent({ status: 'SCHEDULED', takenAt: null, scheduledAt: now });
    mockPrisma.glp1DoseEvent.findFirst.mockResolvedValueOnce(planned).mockResolvedValueOnce(null);
    mockPrisma.glp1DoseEvent.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.glp1Treatment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateDoseEvent('u-1', 'dose-1', {
        takenAt: now.toISOString(),
        status: 'TAKEN',
        futureScheduleAction: 'RESCHEDULE',
        futureIntervalDays: 7,
        futureLocalTime: '08:00',
        treatmentVersion: 1,
        version: 1,
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VERSION_CONFLICT' }),
    });
    expect(mockPrisma.glp1DoseEvent.createMany).not.toHaveBeenCalled();
  });

  it('rejeita local de aplicacao marcado como indisponivel', async () => {
    mockPrisma.glp1InjectionSiteState.findUnique.mockResolvedValue({ unavailable: true });
    await expect(
      service.createDoseEvent('u-1', {
        treatmentId: 'tr-1',
        doseMg: 2.5,
        status: 'TAKEN',
        route: 'SUBCUTANEOUS',
        takenAt: '2026-07-21T12:30:00Z',
        injectionSiteCode: 'abdomen_left',
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INJECTION_SITE_UNAVAILABLE' }),
    });
  });

  it('faz upsert de local de aplicacao por usuario e codigo', async () => {
    mockPrisma.glp1InjectionSiteState.upsert.mockResolvedValue({
      id: 'site-1',
      userId: 'u-1',
      siteCode: 'abdomen_left',
      unavailable: true,
      notes: 'sensivel',
      version: 2,
      createdAt: now,
      updatedAt: now,
    });
    const result = await service.upsertInjectionSite('u-1', {
      siteCode: 'abdomen_left',
      unavailable: true,
      notes: 'sensivel',
    });
    expect(result).toEqual(
      expect.objectContaining({ siteCode: 'abdomen_left', unavailable: true }),
    );
    expect(mockPrisma.glp1InjectionSiteState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_siteCode: { userId: 'u-1', siteCode: 'abdomen_left' } },
      }),
    );
  });

  it('exige acknowledgement e versao de seguranca para sintoma grave', async () => {
    await expect(
      service.createSymptom('u-1', {
        treatmentId: 'tr-1',
        code: 'vomiting',
        severity: 8,
        occurredAt: '2026-07-21T12:00:00Z',
      } as never),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SAFETY_ACKNOWLEDGEMENT_REQUIRED' }),
    });
  });

  it('reexecuta sintoma por clientMutationId sem duplicar', async () => {
    mockPrisma.glp1SymptomEvent.findUnique.mockResolvedValue(symptom());
    const result = await service.createSymptom('u-1', {
      treatmentId: 'tr-1',
      code: 'nausea',
      severity: 4,
      occurredAt: '2026-07-21T12:00:00Z',
      clientMutationId: 'sym-cm-1',
    } as never);
    expect(result.id).toBe('sym-1');
    expect(mockPrisma.glp1SymptomEvent.create).not.toHaveBeenCalled();
  });

  it('publica sintoma criado no journal', async () => {
    mockPrisma.glp1SymptomEvent.findUnique.mockResolvedValueOnce(null);
    mockPrisma.glp1SymptomEvent.create.mockResolvedValue(symptom({ id: 'sym-2' }));

    await service.createSymptom('u-1', {
      treatmentId: 'tr-1',
      code: 'nausea',
      severity: 4,
      occurredAt: '2026-07-21T12:00:00Z',
      clientMutationId: 'sym-cm-2',
    } as never);

    expect(mockPrisma.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u-1',
        entityType: 'GLP1_SYMPTOM_EVENT',
        entityId: 'sym-2',
        action: 'UPSERT',
      }),
    });
  });

  it('faz upsert de lembrete pela chave natural sem duplicar', async () => {
    mockPrisma.glp1ReminderRule.upsert.mockResolvedValue({
      id: 'rem-1',
      userId: 'u-1',
      treatmentId: 'tr-1',
      eventType: 'dose',
      offsetMinutes: -60,
      enabled: true,
      channel: 'local',
      timezone: 'America/Sao_Paulo',
      clientMutationId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const result = await service.upsertReminderRule('u-1', {
      treatmentId: 'tr-1',
      eventType: 'dose',
      offsetMinutes: -60,
      enabled: true,
      timezone: 'America/Sao_Paulo',
    });
    expect(result.id).toBe('rem-1');
    expect(mockPrisma.glp1ReminderRule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_treatmentId_eventType_offsetMinutes_channel: {
            userId: 'u-1',
            treatmentId: 'tr-1',
            eventType: 'dose',
            offsetMinutes: -60,
            channel: 'local',
          },
        },
      }),
    );
  });

  it('nao revela tratamento de outro usuario', async () => {
    mockPrisma.glp1Treatment.findFirst.mockResolvedValue(null);
    await expect(service.listDosePlanPeriods('u-1', 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('replay do setup devolve o mesmo resultado sem nova transacao', async () => {
    const dto = {
      consent: {
        accepted: true,
        version: '1.0.0',
        scopes: ['treatment', 'dose', 'symptoms'],
      },
      treatment: {
        activeIngredient: 'tirzepatide',
        route: 'SUBCUTANEOUS',
        currentDoseMg: 2.5,
        intervalHours: 168,
        timezone: 'America/Sao_Paulo',
      },
      doseEvent: {
        scheduledAt: '2026-07-21T11:00:00Z',
        takenAt: '2026-07-21T11:00:00Z',
        doseMg: 2.5,
        status: 'TAKEN',
        route: 'SUBCUTANEOUS',
      },
    } as never;

    mockPrisma.glp1SetupSubmission.findUnique.mockResolvedValueOnce(null);
    mockPrisma.glp1Consent.create.mockResolvedValue(consent());
    mockPrisma.glp1Treatment.create.mockResolvedValue(treatment());
    mockPrisma.glp1DosePlanPeriod.create.mockResolvedValue(period());
    mockPrisma.glp1DoseEvent.create.mockResolvedValue(doseEvent());
    mockPrisma.glp1SetupSubmission.create.mockResolvedValue({});
    const first = await service.setup('u-1', dto, 'setup-1');
    const createdSubmission = mockPrisma.glp1SetupSubmission.create.mock.calls[0]![0].data;
    mockPrisma.glp1SetupSubmission.findUnique.mockResolvedValueOnce({
      requestHash: createdSubmission.requestHash,
      resultJson: first,
    });
    const replay = await service.setup('u-1', dto, 'setup-1');

    expect(first).toEqual(
      expect.objectContaining({ treatment: expect.objectContaining({ id: 'tr-1' }) }),
    );
    expect(replay).toEqual(first);
    expect(mockPrisma.glp1SetupSubmission.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.glp1DoseEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it('materializa onboarding V1 sem inventar horario para data civil', async () => {
    const setupSpy = jest.spyOn(service, 'setup').mockResolvedValue({ treatment: { id: 'tr-1' } });
    const result = await service.setupFromOnboarding(
      'u-1',
      {
        medication: 'Mounjaro',
        doseMg: 2.5,
        intervalDays: 7,
        lastDoseDate: '2026-07-19',
      },
      'America/Sao_Paulo',
      {
        type: 'glp1_tracking',
        version: '1.0.0',
        scopes: ['treatment', 'dose', 'symptoms', 'exposure'],
        acceptedAt: '2026-07-21T12:00:00Z',
      },
    );
    const setupDto = setupSpy.mock.calls[0]![1];
    expect(setupDto.treatment.activeIngredient).toBe('tirzepatide');
    expect(setupDto.treatment.intervalHours).toBe(168);
    expect(setupDto.doseEvent).toBeUndefined();
    expect(result.doseEvents).toEqual([]);
    expect(result.warnings).toContain('LAST_DOSE_TIME_REQUIRED');
  });

  it('devolve a agenda materializada ao concluir o onboarding GLP-1', async () => {
    const scheduledDose = doseEvent({
      id: 'dose-future-1',
      status: 'SCHEDULED',
      scheduledAt: new Date('2026-07-28T11:00:00Z'),
      takenAt: null,
    });
    jest.spyOn(service, 'setup').mockResolvedValue({ treatment: { id: 'tr-1' } });
    mockPrisma.glp1DoseEvent.findMany.mockResolvedValue([scheduledDose]);

    const result = await service.setupFromOnboarding(
      'u-1',
      {
        medication: 'Mounjaro',
        doseMg: 2.5,
        intervalDays: 7,
        lastDoseDate: '2026-07-21T11:00:00Z',
      },
      'America/Sao_Paulo',
      {
        type: 'glp1_tracking',
        version: '1.0.0',
        scopes: ['treatment', 'dose', 'symptoms'],
        acceptedAt: '2026-07-21T12:00:00Z',
      },
    );

    expect(mockPrisma.glp1DoseEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ treatmentId: 'tr-1' }) }),
    );
    expect(result.doseEvents).toEqual([
      expect.objectContaining({ id: 'dose-future-1', status: 'scheduled' }),
    ]);
  });

  it('nao inventa consentimento no onboarding GLP-1', async () => {
    await expect(
      service.setupFromOnboarding('u-1', {
        medication: 'Mounjaro',
        doseMg: 2.5,
        intervalDays: 7,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'GLP1_CONSENT_REQUIRED' }),
    });
  });

  it('exige principio ativo e via para medicamento personalizado', async () => {
    await expect(
      service.setupFromOnboarding(
        'u-1',
        {
          medication: 'other',
          customMedication: 'Medicamento X',
          doseMg: 1,
          intervalDays: 7,
        },
        'America/Sao_Paulo',
        {
          type: 'glp1_tracking',
          version: '1.0.0',
          scopes: ['treatment', 'dose', 'symptoms'],
          acceptedAt: '2026-07-21T12:00:00Z',
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'GLP1_CUSTOM_MEDICATION_REQUIRES_INPUT' }),
    });
  });

  it('timeline agrega e ordena eventos por data', async () => {
    mockPrisma.glp1DoseEvent.findMany.mockResolvedValue([
      doseEvent({ takenAt: new Date('2026-07-20T12:00:00Z') }),
    ]);
    mockPrisma.glp1SymptomEvent.findMany.mockResolvedValue([
      symptom({ occurredAt: new Date('2026-07-21T12:00:00Z') }),
    ]);
    mockPrisma.glp1DosePlanPeriod.findMany.mockResolvedValue([
      period({ validFrom: new Date('2026-07-01T12:00:00Z') }),
    ]);
    const result = await service.timeline('u-1');
    expect(result.map((entry) => entry.type)).toEqual(['symptom', 'dose', 'dose_plan_period']);
  });
});
