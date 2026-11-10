import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { toGoalType, toUpperEnum } from '../../../common/enum-maps';
import { SUPPORTED_LOCALES } from '../../../shared/constants';

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

enum GoalSpeed {
  SLOW = 'SLOW',
  MODERATE = 'MODERATE',
  FAST = 'FAST',
}

enum Experience {
  beginner = 'beginner',
  intermediate = 'intermediate',
  advanced = 'advanced',
}

export class BodyDataDto {
  @ApiPropertyOptional({ example: 'Matheus' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'pt' })
  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  @MaxLength(8)
  locale?: string;

  @ApiPropertyOptional({ example: '1995-01-01' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: Gender, example: 'male' })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: Gender, example: 'male', description: 'Alias de gender' })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(Gender)
  sex?: Gender;

  @ApiPropertyOptional({ example: 178 })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(300)
  heightCm?: number;

  @ApiPropertyOptional({ example: 82 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  weightKg?: number;

  @ApiPropertyOptional({ enum: ActivityLevel, description: 'Campo app -> activityLevel' })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(ActivityLevel)
  workouts?: ActivityLevel;

  @ApiPropertyOptional({ enum: ActivityLevel })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @ApiPropertyOptional({ enum: ActivityLevel, description: 'Alias de activityLevel/workouts' })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(ActivityLevel)
  exerciseLevel?: ActivityLevel;

  @ApiPropertyOptional({ example: 'omnivore' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dietType?: string;

  @ApiPropertyOptional({ example: 'omnivore', description: 'Alias de dietType' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dietStyle?: string;

  @ApiPropertyOptional({ enum: GoalType, example: 'LOSE' })
  @IsOptional()
  @Transform(({ value }) => toGoalType(value))
  @IsEnum(GoalType)
  goalType?: GoalType;

  @ApiPropertyOptional({ enum: GoalType, example: 'LOSE', description: 'Alias de goalType' })
  @IsOptional()
  @Transform(({ value }) => toGoalType(value))
  @IsEnum(GoalType)
  objective?: GoalType;

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

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  weeklyGoalKg?: number;

  @ApiPropertyOptional({ type: [String], example: ['lactose'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  restrictions?: string[];

  @ApiPropertyOptional({ type: [String], example: ['cebola'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  dislikedFoods?: string[];

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  mealsPerDay?: number;

  @ApiPropertyOptional({ enum: Experience, example: 'beginner' })
  @IsOptional()
  @IsEnum(Experience)
  experience?: Experience;

  @ApiPropertyOptional({ enum: Experience, example: 'beginner' })
  @IsOptional()
  @IsEnum(Experience)
  workoutExperience?: Experience;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  workoutDaysPerWeek?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  healthConditions?: string[];

  @ApiPropertyOptional({ example: 'gym' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  equipment?: string;

  @ApiPropertyOptional({ example: 'gym' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  workoutEquipment?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  minutesPerSession?: number;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  workoutMinutesPerSession?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  exerciseCalories?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  rolloverCalories?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notificationsOptIn?: boolean;

  @ApiPropertyOptional({ description: 'Se false, salva dados e retorna plano ativo existente.' })
  @IsOptional()
  @IsBoolean()
  regeneratePlans?: boolean;
}
