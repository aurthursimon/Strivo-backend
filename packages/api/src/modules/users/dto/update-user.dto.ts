import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { toUpperEnum, toGoalType } from '../../../common/enum-maps';
import { SUPPORTED_LOCALES } from '../../../shared/constants';

enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

enum MeasurementSystem {
  METRIC = 'METRIC',
  IMPERIAL = 'IMPERIAL',
}

enum RegionDetectionSource {
  DEVICE_REGION = 'DEVICE_REGION',
  TIMEZONE = 'TIMEZONE',
  MANUAL = 'MANUAL',
}

enum ActivityLevel {
  SEDENTARY = 'SEDENTARY',
  LIGHT = 'LIGHT',
  MODERATE = 'MODERATE',
  ACTIVE = 'ACTIVE',
  VERY_ACTIVE = 'VERY_ACTIVE',
}

enum DietType {
  OMNIVORE = 'OMNIVORE',
  VEGETARIAN = 'VEGETARIAN',
  VEGAN = 'VEGAN',
  PESCATARIAN = 'PESCATARIAN',
  KETO = 'KETO',
  CARNIVORE = 'CARNIVORE',
  OTHER = 'OTHER',
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

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Matheus' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Preset identifier ("preset:<icon>:<color>") or a small base64 data: URL for a ' +
      'custom photo. null clears it back to the default avatar. There is no object ' +
      'storage configured in this project, so custom photos are stored inline - the ' +
      'client is expected to downscale/compress before sending.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  avatarUrl?: string | null;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  locale?: string;

  @ApiPropertyOptional({ example: 'BR' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional({ enum: MeasurementSystem })
  @IsOptional()
  @IsEnum(MeasurementSystem)
  measurementSystem?: MeasurementSystem;

  @ApiPropertyOptional({ enum: RegionDetectionSource })
  @IsOptional()
  @IsEnum(RegionDetectionSource)
  regionDetectionSource?: RegionDetectionSource;

  @ApiPropertyOptional({ example: '2000-01-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: Gender, example: 'male' })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: 175 })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(300)
  heightCm?: number;

  @ApiPropertyOptional({ example: 72.5 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  weightKg?: number;

  @ApiPropertyOptional({
    enum: ActivityLevel,
    description: 'Campo app `workouts` -> coluna activityLevel',
  })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(ActivityLevel)
  workouts?: ActivityLevel;

  @ApiPropertyOptional({ enum: DietType, example: 'omnivore' })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(DietType)
  dietType?: DietType;

  @ApiPropertyOptional({ enum: GoalType, example: 'LOSE', description: 'Roteia para a Goal ativa' })
  @IsOptional()
  @Transform(({ value }) => toGoalType(value))
  @IsEnum(GoalType)
  goalType?: GoalType;

  @ApiPropertyOptional({
    enum: GoalSpeed,
    example: 'moderate',
    description: 'Roteia para a Goal ativa',
  })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(GoalSpeed)
  goalSpeed?: GoalSpeed;

  @ApiPropertyOptional({ example: 72, description: 'Roteia para a Goal ativa' })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  targetWeightKg?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  exerciseCalories?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  rolloverCalories?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notificationsOptIn?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;

  @ApiPropertyOptional({ description: 'Consentimento para integracao futura com apps de saude' })
  @IsOptional()
  @IsBoolean()
  healthConnectOptIn?: boolean;
}
