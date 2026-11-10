import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { toGoalType, toUpperEnum } from '../../../common/enum-maps';

enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

enum ActivityLevel {
  SEDENTARY = 'SEDENTARY',
  LIGHT = 'LIGHT',
  MODERATE = 'MODERATE',
  ACTIVE = 'ACTIVE',
  VERY_ACTIVE = 'VERY_ACTIVE',
}

enum GoalType {
  LOSE_WEIGHT = 'LOSE_WEIGHT',
  GAIN_WEIGHT = 'GAIN_WEIGHT',
  MAINTAIN = 'MAINTAIN',
  GAIN_MUSCLE = 'GAIN_MUSCLE',
}

export class CalculateTdeeDto {
  @ApiProperty({ enum: Gender })
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(Gender)
  gender!: Gender;

  @ApiProperty({ example: 72.5 })
  @IsNumber()
  @Min(30)
  @Max(300)
  weightKg!: number;

  @ApiProperty({ example: 175 })
  @IsNumber()
  @Min(100)
  @Max(250)
  heightCm!: number;

  @ApiProperty({ example: 26 })
  @IsNumber()
  @Min(18)
  @Max(120)
  ageYears!: number;

  @ApiProperty({ enum: ActivityLevel })
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(ActivityLevel)
  activityLevel!: ActivityLevel;

  @ApiProperty({ enum: GoalType })
  @Transform(({ value }) => toGoalType(value))
  @IsEnum(GoalType)
  goalType!: GoalType;

  @ApiPropertyOptional({ example: 'omnivore' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dietType?: string;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  weeklyGoalKg?: number;
}
