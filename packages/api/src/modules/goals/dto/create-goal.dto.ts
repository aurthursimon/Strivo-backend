import { IsEnum, IsInt, IsNumber, IsOptional, IsDateString, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { toGoalType, toUpperEnum } from '../../../common/enum-maps';

enum GoalType {
  LOSE_WEIGHT = 'LOSE_WEIGHT',
  GAIN_WEIGHT = 'GAIN_WEIGHT',
  MAINTAIN = 'MAINTAIN',
  GAIN_MUSCLE = 'GAIN_MUSCLE',
}

enum GoalSpeed {
  SLOW = 'SLOW',
  MODERATE = 'MODERATE',
  FAST = 'FAST',
}

export class CreateGoalDto {
  @ApiProperty({ enum: GoalType, example: 'LOSE' })
  @Transform(({ value }) => toGoalType(value))
  @IsEnum(GoalType)
  type!: GoalType;

  @ApiPropertyOptional({ enum: GoalSpeed, example: 'moderate' })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(GoalSpeed)
  goalSpeed?: GoalSpeed;

  @ApiPropertyOptional({ example: 75 })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  targetWeightKg?: number;

  @ApiProperty({ example: 2100 })
  @IsInt()
  @Min(1000)
  @Max(6000)
  calories!: number;

  @ApiPropertyOptional({ example: 160 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  protein?: number;

  @ApiPropertyOptional({ example: 210 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(800)
  carbs?: number;

  @ApiPropertyOptional({ example: 70 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  fat?: number;

  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  waterMl?: number;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  weeklyGoalKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  targetDate?: string;
}
