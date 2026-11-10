import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum PointsEventType {
  MEAL_LOGGED = 'MEAL_LOGGED',
  WATER_GOAL_MET = 'WATER_GOAL_MET',
  WORKOUT_COMPLETED = 'WORKOUT_COMPLETED',
  PLAN_GENERATED = 'PLAN_GENERATED',
  STREAK_DAY = 'STREAK_DAY',
  BADGE_UNLOCKED = 'BADGE_UNLOCKED',
}

export class PointsEventDto {
  @ApiProperty({ description: 'Id deterministico do evento; garante idempotencia' })
  @IsString()
  @MaxLength(128)
  eventId!: string;

  @ApiProperty({ enum: PointsEventType })
  @IsEnum(PointsEventType)
  type!: PointsEventType;

  @ApiPropertyOptional({
    description: 'Pontos sugeridos pelo cliente; ignorados (servidor recalcula)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number;

  @ApiPropertyOptional({ description: 'Quando o evento ocorreu (ISO)' })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
