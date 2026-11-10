import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
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
  Matches,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { toGoalType, toUpperEnum } from '../../../common/enum-maps';
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

enum MedicationMarket {
  BRAZIL = 'BRAZIL',
  UNITED_STATES = 'UNITED_STATES',
  EUROPE = 'EUROPE',
  ASIA = 'ASIA',
  INTERNATIONAL = 'INTERNATIONAL',
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

enum LegacyGlp1Route {
  SUBCUTANEOUS = 'SUBCUTANEOUS',
  ORAL = 'ORAL',
}

enum PlanProvisioningSource {
  ONBOARDING = 'ONBOARDING',
}

export class OnboardingPlanProvisioningDto {
  @ApiProperty({ example: true })
  @Equals(true)
  calculateNutritionTargets!: true;

  @ApiProperty({ example: true })
  @Equals(true)
  generateDietPlan!: true;

  @ApiProperty({
    example: false,
    description: 'Treino e personalizado pelo usuario apos o onboarding.',
  })
  @IsBoolean()
  generateWorkoutPlan!: boolean;

  @ApiProperty({ enum: PlanProvisioningSource })
  @IsEnum(PlanProvisioningSource)
  source!: PlanProvisioningSource;
}

export class LegacyOnboardingGlp1Dto {
  @ApiProperty({ example: 'Mounjaro' })
  @IsString()
  @MaxLength(120)
  medication!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customMedication?: string;

  @ApiPropertyOptional({ enum: MedicationMarket })
  @IsOptional()
  @IsEnum(MedicationMarket)
  medicationMarket?: MedicationMarket;

  @ApiPropertyOptional({ example: 'BR' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  medicationCountryCode?: string;

  @ApiPropertyOptional({ example: 'tirzepatide' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  activeIngredient?: string;

  @ApiPropertyOptional({ enum: LegacyGlp1Route, example: 'subcutaneous' })
  @IsOptional()
  @Transform(({ value }) => toUpperEnum(value))
  @IsEnum(LegacyGlp1Route)
  route?: LegacyGlp1Route;

  @ApiPropertyOptional({ example: 'pen' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  formulation?: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(1000)
  doseMg!: number;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(1)
  @Max(365)
  intervalDays!: number;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  usualLocalTime?: string;

  @ApiPropertyOptional({ example: '2026-07-19' })
  @IsOptional()
  @IsDateString()
  lastDoseDate?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ example: 87.2 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  startWeightKg?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  sideEffects?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivation?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  cravingPeakDay?: number;
}

export class OnboardingConsentDto {
  @ApiProperty({ example: 'glp1_tracking' })
  @IsString()
  @MaxLength(80)
  type!: string;

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  @MaxLength(32)
  version!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  scopes!: string[];

  @ApiProperty()
  @IsDateString()
  acceptedAt!: string;
}

export class CompleteOnboardingDto {
  @ApiPropertyOptional({ type: OnboardingPlanProvisioningDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingPlanProvisioningDto)
  planProvisioning?: OnboardingPlanProvisioningDto;

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

  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional({ example: 'BR' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({ enum: MeasurementSystem })
  @IsOptional()
  @IsEnum(MeasurementSystem)
  measurementSystem?: MeasurementSystem;

  @ApiPropertyOptional({ enum: RegionDetectionSource })
  @IsOptional()
  @IsEnum(RegionDetectionSource)
  regionDetectionSource?: RegionDetectionSource;

  @ApiProperty({ example: '2000-01-15' })
  @IsDateString()
  birthDate!: string;

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

  @ApiProperty({ example: 175 })
  @IsNumber()
  @Min(50)
  @Max(300)
  heightCm!: number;

  @ApiProperty({ example: 72.5 })
  @IsNumber()
  @Min(20)
  @Max(500)
  weightKg!: number;

  @ApiPropertyOptional({ enum: ActivityLevel, description: 'Alias aceito pelo app atual' })
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

  @ApiPropertyOptional({ example: 68 })
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

  @ApiPropertyOptional({ type: [Number], example: [1, 3, 5] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({ type: [Number], example: [1, 3, 5] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workoutDaysOfWeek?: number[];

  @ApiPropertyOptional({ example: 'GYM' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  location?: string;

  @ApiPropertyOptional({ example: 'GYM' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  workoutLocation?: string;

  @ApiPropertyOptional({ example: 'GENERAL_FITNESS' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workoutGoal?: string;

  @ApiPropertyOptional({ example: 'AUTO' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  splitPreference?: string;

  @ApiPropertyOptional({ type: [String], example: ['dumbbells', 'bench'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  availableEquipment?: string[];

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
  healthConnectOptIn?: boolean;

  @ApiPropertyOptional({ type: LegacyOnboardingGlp1Dto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LegacyOnboardingGlp1Dto)
  glp1?: LegacyOnboardingGlp1Dto;

  @ApiPropertyOptional({ type: [OnboardingConsentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OnboardingConsentDto)
  consents?: OnboardingConsentDto[];
}
