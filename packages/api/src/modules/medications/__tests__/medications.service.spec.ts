import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MedicationsService } from '../medications.service';
import { PrismaService } from '../../../prisma';

const mockPrisma = {
  medicationConsent: { findUnique: jest.fn(), upsert: jest.fn() },
  medication: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  medicationLog: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
};

describe('MedicationsService', () => {
  let service: MedicationsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MedicationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(MedicationsService);
    jest.clearAllMocks();
  });

  describe('consent gating', () => {
    it('createMedication lanca Forbidden sem consentimento', async () => {
      mockPrisma.medicationConsent.findUnique.mockResolvedValue(null);
      await expect(
        service.createMedication('u1', {
          name: 'X',
          dosage: '1',
          frequency: '1x',
          reminderTimes: ['08:00'],
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.medication.create).not.toHaveBeenCalled();
    });

    it('createLog lanca Forbidden sem consentimento', async () => {
      mockPrisma.medicationConsent.findUnique.mockResolvedValue(null);
      await expect(
        service.createLog('u1', { medicationId: 'm1', skipped: false } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('acceptConsent', () => {
    it('rejeita accepted=false', async () => {
      await expect(
        service.acceptConsent('u1', { accepted: false } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persiste consentimento e retorna acceptedAt/version', async () => {
      mockPrisma.medicationConsent.upsert.mockResolvedValue({
        acceptedAt: new Date('2026-06-01T00:00:00Z'),
        version: '1',
      });
      const result = await service.acceptConsent('u1', { accepted: true } as never);
      expect(result).toEqual({ acceptedAt: new Date('2026-06-01T00:00:00Z'), version: '1' });
    });
  });

  describe('createMedication', () => {
    it('mapeia reminderTimes -> reminderTimesJson e serializa', async () => {
      mockPrisma.medicationConsent.findUnique.mockResolvedValue({ userId: 'u1' });
      mockPrisma.medication.create.mockResolvedValue({
        id: 'm1',
        name: 'X',
        dosage: '500mg',
        frequency: '2x',
        reminderTimesJson: ['08:00', '20:00'],
        notes: null,
        createdAt: new Date('2026-06-01T00:00:00Z'),
      });

      const result = await service.createMedication('u1', {
        name: 'X',
        dosage: '500mg',
        frequency: '2x',
        reminderTimes: ['08:00', '20:00'],
      } as never);

      const createArg = mockPrisma.medication.create.mock.calls[0][0];
      expect(createArg.data.reminderTimesJson).toEqual(['08:00', '20:00']);
      expect(result.reminderTimes).toEqual(['08:00', '20:00']);
      expect(Object.keys(result)).not.toContain('userId');
    });
  });

  describe('createLog', () => {
    it('e idempotente por clientMutationId', async () => {
      mockPrisma.medicationConsent.findUnique.mockResolvedValue({ userId: 'u1' });
      mockPrisma.medicationLog.findUnique.mockResolvedValue({
        id: 'log-1',
        medicationId: 'm1',
        takenAt: new Date('2026-06-01T00:00:00Z'),
        skipped: false,
      });

      const result = await service.createLog('u1', {
        medicationId: 'm1',
        skipped: false,
        clientMutationId: 'cm-1',
      } as never);

      expect(result.id).toBe('log-1');
      expect(mockPrisma.medicationLog.create).not.toHaveBeenCalled();
    });

    it('valida posse do medicamento', async () => {
      mockPrisma.medicationConsent.findUnique.mockResolvedValue({ userId: 'u1' });
      mockPrisma.medicationLog.findUnique.mockResolvedValue(null);
      mockPrisma.medication.findFirst.mockResolvedValue(null);
      await expect(
        service.createLog('u1', { medicationId: 'mX', skipped: false } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteMedication', () => {
    it('faz soft delete (seta deletedAt)', async () => {
      mockPrisma.medication.findFirst.mockResolvedValue({ id: 'm1' });
      mockPrisma.medication.update.mockResolvedValue({
        id: 'm1',
        name: 'X',
        dosage: '1',
        frequency: '1x',
        reminderTimesJson: [],
        createdAt: new Date('2026-06-01T00:00:00Z'),
      });
      await service.deleteMedication('u1', 'm1');
      const updateArg = mockPrisma.medication.update.mock.calls[0][0];
      expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
