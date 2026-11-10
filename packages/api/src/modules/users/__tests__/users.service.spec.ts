import { Test } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma';
import type { UpdateUserDto } from '../dto';

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  goal: {
    findFirst: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  dailyLog: {
    deleteMany: jest.fn(),
  },
  trainingWorkout: { deleteMany: jest.fn() },
  trainingChallengeEntry: { deleteMany: jest.fn() },
  communityStory: { deleteMany: jest.fn() },
  workoutSession: {
    deleteMany: jest.fn(),
  },
  glp1Treatment: {
    deleteMany: jest.fn(),
  },
  communityPost: {
    updateMany: jest.fn(),
  },
  communityComment: {
    updateMany: jest.fn(),
  },
  communityLike: {
    deleteMany: jest.fn(),
  },
  refreshToken: {
    updateMany: jest.fn(),
  },
  scanAccountCleanupTask: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  subscription: {
    findUnique: jest.fn(),
  },
  billingSubject: {
    updateMany: jest.fn(),
  },
  billingSubscription: {
    deleteMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
    );
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    mockPrisma.scanAccountCleanupTask.findUnique.mockResolvedValue(null);
  });

  describe('update', () => {
    it('persiste o payload de onboarding completo com nomes canonicos', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', scanAccountGeneration: 1 });
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        name: 'Matheus',
        onboardingCompleted: true,
        gender: 'MALE',
        activityLevel: 'MODERATE',
      });

      // DTO ja normalizado (enums UPPER). O @Transform roda no ValidationPipe.
      const dto = {
        name: 'Matheus',
        locale: 'pt',
        countryCode: 'BR',
        timezone: 'America/Sao_Paulo',
        measurementSystem: 'METRIC',
        regionDetectionSource: 'DEVICE_REGION',
        birthDate: '2000-01-15',
        gender: 'MALE',
        heightCm: 175,
        weightKg: 72,
        workouts: 'MODERATE',
        dietType: 'OMNIVORE',
        exerciseCalories: true,
        rolloverCalories: false,
        notificationsOptIn: true,
        onboardingCompleted: true,
      } as unknown as UpdateUserDto;

      await service.update('user-1', dto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            name: 'Matheus',
            locale: 'pt',
            countryCode: 'BR',
            timezone: 'America/Sao_Paulo',
            measurementSystem: 'METRIC',
            regionDetectionSource: 'DEVICE_REGION',
            birthDate: expect.any(Date),
            gender: 'MALE',
            heightCm: 175,
            weightKg: 72,
            activityLevel: 'MODERATE',
            dietType: 'OMNIVORE',
            exerciseCalories: true,
            rolloverCalories: false,
            notificationsOptIn: true,
            onboardingCompleted: true,
          }),
        }),
      );
      // `workouts` nao deve vazar cru para o Prisma
      const callData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty('workouts');
    });

    it('atualiza apenas name quando isolado, sem tocar metas', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', scanAccountGeneration: 1 });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', name: 'Novo' });

      await service.update('user-1', { name: 'Novo' } as UpdateUserDto);

      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.goal.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.goal.update).not.toHaveBeenCalled();
    });

    it('define avatarUrl com um preset ou foto em base64', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', scanAccountGeneration: 1 });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', avatarUrl: 'preset:flame:primary' });

      await service.update('user-1', { avatarUrl: 'preset:flame:primary' } as UpdateUserDto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avatarUrl: 'preset:flame:primary' }),
        }),
      );
    });

    it('limpa avatarUrl de volta pro padrao quando enviado null explicitamente', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', scanAccountGeneration: 1 });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', avatarUrl: null });

      await service.update('user-1', { avatarUrl: null } as UpdateUserDto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ avatarUrl: null }) }),
      );
    });

    it('nao toca avatarUrl quando o campo e omitido', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', scanAccountGeneration: 1 });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', name: 'Novo' });

      await service.update('user-1', { name: 'Novo' } as UpdateUserDto);

      const callData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(callData.avatarUrl).toBeUndefined();
    });

    it('rejeita birthDate fora da faixa segura antes de persistir', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', scanAccountGeneration: 1 });

      await expect(
        service.update('user-1', { birthDate: '2099-01-01' } as UpdateUserDto),
      ).rejects.toThrow('birthDate fora da faixa aceita');
      await expect(
        service.update('user-1', { birthDate: '1900-01-01' } as UpdateUserDto),
      ).rejects.toThrow('birthDate fora da faixa aceita');
      await expect(
        service.update('user-1', { birthDate: 'data-invalida' } as UpdateUserDto),
      ).rejects.toThrow('birthDate fora da faixa aceita');
      const minorBirthDate = new Date();
      minorBirthDate.setFullYear(minorBirthDate.getFullYear() - 17);
      await expect(
        service.update('user-1', {
          birthDate: minorBirthDate.toISOString().slice(0, 10),
        } as UpdateUserDto),
      ).rejects.toThrow('birthDate fora da faixa aceita');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('roteia goalType/goalSpeed/targetWeightKg para a Goal ativa quando existe', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', scanAccountGeneration: 1 });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1' });
      mockPrisma.goal.findFirst.mockResolvedValue({ id: 'goal-1' });
      mockPrisma.goal.update.mockResolvedValue({ id: 'goal-1' });

      const dto = {
        goalType: 'LOSE_WEIGHT',
        goalSpeed: 'MODERATE',
        targetWeightKg: 72,
      } as unknown as UpdateUserDto;

      await service.update('user-1', dto);

      expect(mockPrisma.goal.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true },
        select: { id: true },
      });
      expect(mockPrisma.goal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { type: 'LOSE_WEIGHT', goalSpeed: 'MODERATE', targetWeightKg: 72 },
      });
    });

    it('NAO cria Goal quando nao existe meta ativa', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1' });
      mockPrisma.goal.findFirst.mockResolvedValue(null);

      const dto = { goalType: 'LOSE_WEIGHT', goalSpeed: 'MODERATE' } as unknown as UpdateUserDto;

      await service.update('user-1', dto);

      expect(mockPrisma.goal.findFirst).toHaveBeenCalled();
      expect(mockPrisma.goal.update).not.toHaveBeenCalled();
    });

    it('retorna shape app via serializeUser (enums lowercase + onboardingCompleted)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        gender: 'MALE',
        activityLevel: 'MODERATE',
        dietType: 'OMNIVORE',
        onboardingCompleted: true,
      });

      const result = await service.update('user-1', { name: 'X' } as UpdateUserDto);

      expect(result.gender).toBe('male');
      expect(result.activityLevel).toBe('moderate');
      expect(result.dietType).toBe('omnivore');
      expect(result.onboardingCompleted).toBe(true);
    });
  });

  describe('findMe', () => {
    it('retorna shape app via serializeUser', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        gender: 'FEMALE',
        onboardingCompleted: false,
      });

      const result = await service.findMe('user-1');

      expect(result.gender).toBe('female');
      expect(result.onboardingCompleted).toBe(false);
    });
  });

  describe('deleteAccount', () => {
    it('deve revogar sessoes e remover dados em cascata', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'user-1', provider: 'EMAIL', scanAccountGeneration: 1 },
      ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.user.delete.mockResolvedValue({});

      await service.deleteAccount('user-1');

      const lockQuery = mockPrisma.$queryRaw.mock.calls[1]![0] as {
        strings: readonly string[];
      };
      expect(lockQuery.strings.join('?')).toContain('FOR UPDATE');
      expect(mockPrisma.scanAccountCleanupTask.create).toHaveBeenCalledWith({
        data: {
          id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          ),
          subjectId: 'user-1',
          subjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          accountGeneration: 1,
          appleRevocationRequired: false,
        },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('registra a limpeza externa dentro da mesma transacao sem chamar o Scan Cloud', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'user-1', provider: 'EMAIL', scanAccountGeneration: 1 },
      ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.scanAccountCleanupTask.create.mockResolvedValue({});
      mockPrisma.user.delete.mockResolvedValue({});

      await expect(service.deleteAccount('user-1')).resolves.toBeUndefined();

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.scanAccountCleanupTask.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.delete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.scanAccountCleanupTask.create.mock.invocationCallOrder[0]!).toBeLessThan(
        mockPrisma.user.delete.mock.invocationCallOrder[0]!,
      );
    });

    it('desvincula o titular opaco antes de remover a identidade autenticavel', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'user-1', provider: 'EMAIL', scanAccountGeneration: 1 },
      ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.billingSubject.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockResolvedValue({});

      await service.deleteAccount('user-1');

      expect(mockPrisma.billingSubject.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { userId: null, detachedAt: expect.any(Date) },
      });
      expect(mockPrisma.billingSubject.updateMany.mock.invocationCallOrder[0]!).toBeLessThan(
        mockPrisma.user.delete.mock.invocationCallOrder[0]!,
      );
    });

    it('preserva o historico de assinaturas nativas', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'user-1', provider: 'EMAIL', scanAccountGeneration: 2 },
      ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.billingSubject.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockResolvedValue({});

      await service.deleteAccount('user-1');

      expect(mockPrisma.billingSubscription.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('serializa exclusao com worker de reporting e preserva somente evidencia pseudonima', async () => {
      const events: string[] = [];
      const retainedReportingEvidence: Array<Record<string, unknown>> = [];
      const state: {
        user: {
          id: string;
          email: string;
          provider: string;
          providerId: string | null;
          scanAccountGeneration: number;
        } | null;
        billingSubject: { id: string; userId: string | null; detachedAt: Date | null };
      } = {
        user: {
          id: 'user-1',
          email: 'person@example.com',
          provider: 'EMAIL',
          providerId: null,
          scanAccountGeneration: 2,
        },
        billingSubject: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          userId: 'user-1',
          detachedAt: null,
        },
      };

      let releaseHeldLock: (() => void) | undefined;
      let lockTail = Promise.resolve();
      let transactionNumber = 0;
      let reportingCanCommit!: () => void;
      const reportingCommitGate = new Promise<void>((resolve) => {
        reportingCanCommit = resolve;
      });
      let reportingLocked!: () => void;
      const reportingLockAcquired = new Promise<void>((resolve) => {
        reportingLocked = resolve;
      });
      let deletionRequestedLock!: () => void;
      const deletionLockRequested = new Promise<void>((resolve) => {
        deletionRequestedLock = resolve;
      });

      mockPrisma.billingSubject.updateMany.mockImplementation(async () => {
        state.billingSubject.userId = null;
        state.billingSubject.detachedAt = new Date('2026-08-26T12:01:00.000Z');
        events.push('deletion:subject-detached');
        return { count: 1 };
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockImplementation(async () => {
        state.user = null;
        events.push('deletion:user-deleted');
        return {};
      });
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          transactionNumber += 1;
          const transactionLabel = transactionNumber === 1 ? 'reporting' : 'deletion';
          let releaseTransactionLock: (() => void) | undefined;
          const tx = {
            ...mockPrisma,
            $queryRaw: jest.fn(async (query: { strings: readonly string[] }) => {
              const sql = query.strings.join('?');
              if (sql.includes('FROM "users"') && sql.includes('FOR UPDATE')) {
                events.push(`${transactionLabel}:lock-requested`);
                if (transactionLabel === 'deletion') deletionRequestedLock();

                const previousLock = lockTail;
                lockTail = new Promise<void>((resolve) => {
                  releaseHeldLock = resolve;
                });
                await previousLock;
                releaseTransactionLock = releaseHeldLock;
                events.push(`${transactionLabel}:lock-acquired`);
                if (transactionLabel === 'reporting') reportingLocked();
              }

              return state.user ? [state.user] : [];
            }),
          } as typeof mockPrisma;

          try {
            return await callback(tx);
          } finally {
            releaseTransactionLock?.();
          }
        },
      );

      const reportingWorker = mockPrisma.$transaction(async (tx: typeof mockPrisma) => {
        await tx.$queryRaw({
          strings: ['SELECT "id" FROM "users" WHERE "id" = ? FOR UPDATE'],
        });
        await reportingCommitGate;
        retainedReportingEvidence.push({
          billingSubjectId: state.billingSubject.id,
          externalTransactionId: 'gxt_retained_1',
          providerTransactionId: 'app_store_transaction_retained_1',
          state: 'PENDING',
        });
        events.push('reporting:evidence-committed');
      });
      await reportingLockAcquired;

      const deletion = service.deleteAccount('user-1');
      await deletionLockRequested;

      expect(mockPrisma.billingSubject.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();

      reportingCanCommit();
      await reportingWorker;
      await deletion;

      expect(events.indexOf('reporting:evidence-committed')).toBeLessThan(
        events.indexOf('deletion:lock-acquired'),
      );
      expect(events.indexOf('deletion:subject-detached')).toBeLessThan(
        events.indexOf('deletion:user-deleted'),
      );
      expect(state.user).toBeNull();
      expect(state.billingSubject).toEqual({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        userId: null,
        detachedAt: expect.any(Date),
      });
      expect(retainedReportingEvidence).toEqual([
        {
          billingSubjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          externalTransactionId: 'gxt_retained_1',
          providerTransactionId: 'app_store_transaction_retained_1',
          state: 'PENDING',
        },
      ]);
      expect(JSON.stringify(retainedReportingEvidence)).not.toContain('person@example.com');
      expect(JSON.stringify(retainedReportingEvidence)).not.toContain('user-1');
      expect(mockPrisma.billingSubscription.deleteMany).not.toHaveBeenCalled();
    });

    it('permite excluir a conta com assinatura gerenciada pela App Store', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'user-1', provider: 'EMAIL', scanAccountGeneration: 1 },
      ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockResolvedValue({});

      await service.deleteAccount('user-1');

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('copia a credencial Apple criptografada para o outbox antes de apagar os dados locais', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            provider: 'APPLE',
            providerId: 'apple-sub-1',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'user-1',
            provider: 'APPLE',
            providerId: 'apple-sub-1',
            scanAccountGeneration: 4,
          },
        ])
        .mockResolvedValueOnce([
          {
            tokenCiphertext: 'ciphertext',
            tokenIv: 'iv',
            tokenTag: 'tag',
            tokenType: 'refresh_token',
            tokenKeyId: 'apple-v1',
          },
        ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockResolvedValue({});

      await service.deleteAccount('user-1');

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.scanAccountCleanupTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountGeneration: 4,
          subjectId: 'user-1',
          providerSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          appleRevocationRequired: true,
          appleTokenCiphertext: 'ciphertext',
          appleTokenIv: 'iv',
          appleTokenTag: 'tag',
          appleTokenType: 'refresh_token',
          appleTokenKeyId: 'apple-v1',
        }),
      });
      expect(mockPrisma.scanAccountCleanupTask.create.mock.invocationCallOrder[0]!).toBeLessThan(
        mockPrisma.user.delete.mock.invocationCallOrder[0]!,
      );
      const credentialLock = mockPrisma.$queryRaw.mock.calls[3]![0] as {
        strings: readonly string[];
      };
      expect(credentialLock.strings.join('?')).toContain('apple_credentials');
      expect(credentialLock.strings.join('?')).toContain('FOR UPDATE');
    });

    it('nao apaga dados Apple sem uma credencial duravel para revogacao', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            provider: 'APPLE',
            providerId: 'apple-sub-1',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'user-1',
            provider: 'APPLE',
            providerId: 'apple-sub-1',
            scanAccountGeneration: 1,
          },
        ])
        .mockResolvedValueOnce([]);

      await expect(service.deleteAccount('user-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'APPLE_REAUTH_REQUIRED' }),
      });

      expect(mockPrisma.scanAccountCleanupTask.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('retries under the new social lock when a guest is linked during deletion', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ provider: 'GUEST', providerId: null }])
        .mockResolvedValueOnce([
          {
            id: 'guest-1',
            provider: 'GOOGLE',
            providerId: 'google-sub-1',
            scanAccountGeneration: 1,
          },
        ])
        .mockResolvedValueOnce([{ provider: 'GOOGLE', providerId: 'google-sub-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'guest-1',
            provider: 'GOOGLE',
            providerId: 'google-sub-1',
            scanAccountGeneration: 1,
          },
        ]);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockResolvedValue({});

      await service.deleteAccount('guest-1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(mockPrisma.scanAccountCleanupTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subjectId: 'guest-1',
          providerSubjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          appleRevocationRequired: false,
        }),
      });
      expect(mockPrisma.user.delete).toHaveBeenCalledTimes(1);
    });

    it('returns success after a lost response when the durable receipt exists', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.scanAccountCleanupTask.findUnique.mockResolvedValue({ id: 'receipt-1' });

      await expect(service.deleteAccount('user-1')).resolves.toBeUndefined();

      expect(mockPrisma.scanAccountCleanupTask.findUnique).toHaveBeenCalledWith({
        where: { subjectHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
        select: { id: true },
      });
      expect(mockPrisma.scanAccountCleanupTask.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('honors a receipt already verified by the deletion-only guard', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.deleteAccount('user-1', true)).resolves.toBeUndefined();

      expect(mockPrisma.scanAccountCleanupTask.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('permite excluir uma conta convidada sem vinculo Apple', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'guest-1', provider: 'GUEST', scanAccountGeneration: 1 },
      ]);
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockResolvedValue({});

      await service.deleteAccount('guest-1');

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'guest-1' } });
    });
  });

  describe('resetTrackedData', () => {
    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        provider: 'EMAIL',
        providerId: null,
        scanAccountGeneration: 1,
      });
      for (const model of [
        mockPrisma.dailyLog,
        mockPrisma.workoutSession,
        mockPrisma.trainingWorkout,
        mockPrisma.trainingChallengeEntry,
        mockPrisma.communityStory,
        mockPrisma.goal,
        mockPrisma.glp1Treatment,
        mockPrisma.communityLike,
      ]) {
        model.deleteMany.mockResolvedValue({ count: 0 });
      }
      mockPrisma.communityPost.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.communityComment.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.update.mockResolvedValue({});
    });

    it('clears every tracked-data table scoped to the user, keeping the account itself', async () => {
      await service.resetTrackedData('user-1');

      // DailyLog cascades to Meal/WaterEntry/WeightEntry, Glp1Treatment
      // cascades to its dose plan periods/dose events/symptom events - see
      // the method's own comment for why only the two parents are deleted
      // directly.
      expect(mockPrisma.dailyLog.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.workoutSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(mockPrisma.goal.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.trainingWorkout.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.trainingChallengeEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.communityStory.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.glp1Treatment.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(mockPrisma.communityLike.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { weightKg: null },
      });
    });

    it('soft-deletes community posts and comments instead of hard-deleting them', async () => {
      // So another user's reply inside a thread this user posted in isn't
      // left pointing at a row that no longer exists - same convention as
      // CommunityService.deletePost/deleteComment.
      await service.resetTrackedData('user-1');

      expect(mockPrisma.communityPost.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockPrisma.communityComment.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('never touches billing/subscription or auth/session tables', async () => {
      await service.resetTrackedData('user-1');

      expect(mockPrisma.billingSubject.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.billingSubscription.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('rejects a nonexistent user instead of silently clearing nothing', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.resetTrackedData('ghost')).rejects.toThrow('Usuario nao encontrado');
      expect(mockPrisma.dailyLog.deleteMany).not.toHaveBeenCalled();
    });
  });
});
