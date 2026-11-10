import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  serializeConsent,
  serializeMedication,
  serializeMedicationLog,
} from './medications.serializer';
import type {
  AcceptConsentDto,
  CreateMedicationDto,
  CreateMedicationLogDto,
  UpdateMedicationDto,
} from './dto';

const DEFAULT_CONSENT_VERSION = '1';

@Injectable()
export class MedicationsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Consentimento ---

  async getConsent(userId: string) {
    const consent = await this.prisma.medicationConsent.findUnique({ where: { userId } });
    return serializeConsent(consent);
  }

  async acceptConsent(userId: string, dto: AcceptConsentDto) {
    if (!dto.accepted) {
      throw new BadRequestException('Consentimento deve ser explicitamente aceito.');
    }
    const version = dto.version ?? DEFAULT_CONSENT_VERSION;
    const consent = await this.prisma.medicationConsent.upsert({
      where: { userId },
      create: { userId, version },
      update: { version, acceptedAt: new Date() },
    });
    return serializeConsent(consent);
  }

  /** Exige consentimento registrado antes de qualquer escrita de medicamento. */
  private async requireConsent(userId: string): Promise<void> {
    const consent = await this.prisma.medicationConsent.findUnique({ where: { userId } });
    if (!consent) {
      throw new ForbiddenException(
        'Consentimento de medicamentos necessario antes de salvar dados.',
      );
    }
  }

  // --- Medicamentos ---

  async listMedications(userId: string) {
    const meds = await this.prisma.medication.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return meds.map(serializeMedication);
  }

  async createMedication(userId: string, dto: CreateMedicationDto) {
    await this.requireConsent(userId);
    const med = await this.prisma.medication.create({
      data: {
        userId,
        name: dto.name,
        dosage: dto.dosage,
        frequency: dto.frequency,
        reminderTimesJson: dto.reminderTimes as never,
        notes: dto.notes,
      },
    });
    return serializeMedication(med);
  }

  async updateMedication(userId: string, id: string, dto: UpdateMedicationDto) {
    await this.requireConsent(userId);
    const existing = await this.prisma.medication.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Medicamento nao encontrado.');
    }
    const med = await this.prisma.medication.update({
      where: { id },
      data: {
        name: dto.name,
        dosage: dto.dosage,
        frequency: dto.frequency,
        reminderTimesJson:
          dto.reminderTimes !== undefined ? (dto.reminderTimes as never) : undefined,
        notes: dto.notes,
      },
    });
    return serializeMedication(med);
  }

  async deleteMedication(userId: string, id: string) {
    const existing = await this.prisma.medication.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Medicamento nao encontrado.');
    }
    await this.prisma.medication.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // --- Logs ---

  async listLogs(userId: string, medicationId?: string) {
    const logs = await this.prisma.medicationLog.findMany({
      where: { userId, ...(medicationId ? { medicationId } : {}) },
      orderBy: { takenAt: 'desc' },
    });
    return logs.map(serializeMedicationLog);
  }

  async createLog(userId: string, dto: CreateMedicationLogDto) {
    await this.requireConsent(userId);

    // Idempotencia por clientMutationId, quando enviado.
    if (dto.clientMutationId) {
      const existing = await this.prisma.medicationLog.findUnique({
        where: { userId_clientMutationId: { userId, clientMutationId: dto.clientMutationId } },
      });
      if (existing) {
        return serializeMedicationLog(existing);
      }
    }

    const medication = await this.prisma.medication.findFirst({
      where: { id: dto.medicationId, userId, deletedAt: null },
    });
    if (!medication) {
      throw new NotFoundException('Medicamento nao encontrado.');
    }

    const log = await this.prisma.medicationLog.create({
      data: {
        userId,
        medicationId: dto.medicationId,
        skipped: dto.skipped,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : new Date(),
        clientMutationId: dto.clientMutationId,
      },
    });
    return serializeMedicationLog(log);
  }
}
