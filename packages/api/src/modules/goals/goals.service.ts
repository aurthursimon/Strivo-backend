import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { calculateAll, calculateFiberG } from '../../shared';
import type { TdeeResult } from '../../shared';
import { serializeGoal } from '../../common/enum-maps';
import type { CreateGoalDto } from './dto/create-goal.dto';
import type { CalculateTdeeDto } from './dto/calculate-tdee.dto';

interface GoalCalculationContext {
  algorithmVersion: string;
  input: Record<string, unknown>;
}

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateTdee(dto: CalculateTdeeDto): Promise<TdeeResult> {
    return calculateAll({
      gender: dto.gender,
      weightKg: dto.weightKg,
      heightCm: dto.heightCm,
      ageYears: dto.ageYears,
      activityLevel: dto.activityLevel,
      goalType: dto.goalType,
      dietType: dto.dietType,
      weeklyGoalKg: dto.weeklyGoalKg,
    });
  }

  async create(userId: string, dto: CreateGoalDto, calculation?: GoalCalculationContext) {
    const dietType = await this.userDietType(userId);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.goal.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });

      return tx.goal.create({
        data: {
          userId,
          ...this.mapGoalInput(dto, dietType),
          type: dto.type,
          dailyCalories: dto.calories,
          dailyFiberG: calculateFiberG(dto.calories, dietType),
          algorithmVersion: calculation?.algorithmVersion,
          calculationInputJson: calculation?.input as never,
        },
      });
    });

    return serializeGoal(created);
  }

  async findActive(userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { userId, isActive: true },
    });

    if (!goal) {
      throw new NotFoundException('Nenhuma meta ativa');
    }

    return serializeGoal(goal);
  }

  async update(userId: string, goalId: string, dto: Partial<CreateGoalDto>) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
    });

    if (!goal) {
      throw new NotFoundException('Meta nao encontrada');
    }

    const dietType = await this.userDietType(userId);
    const updated = await this.prisma.goal.update({
      where: { id: goalId },
      data: this.mapGoalInput(dto, dietType),
    });

    return serializeGoal(updated);
  }

  /**
   * Adapta o shape app (calories/protein/.../type/goalSpeed) para os nomes
   * canonicos do Prisma. Campos ausentes viram undefined e sao ignorados pelo
   * Prisma — nunca fazemos spread cru dos campos app no update/create.
   */
  private mapGoalInput(dto: Partial<CreateGoalDto>, dietType?: string) {
    return {
      type: dto.type,
      goalSpeed: dto.goalSpeed,
      targetWeightKg: dto.targetWeightKg,
      dailyCalories: dto.calories,
      dailyProteinG: dto.protein,
      dailyCarbsG: dto.carbs,
      dailyFatG: dto.fat,
      dailyFiberG: dto.calories !== undefined ? calculateFiberG(dto.calories, dietType) : undefined,
      waterMl: dto.waterMl,
      weeklyGoalKg: dto.weeklyGoalKg,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
    };
  }

  private async userDietType(userId: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dietType: true },
    });
    return user?.dietType ?? undefined;
  }
}
