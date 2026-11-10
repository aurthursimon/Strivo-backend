import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum Experience {
  beginner = 'beginner',
  intermediate = 'intermediate',
  advanced = 'advanced',
}

export enum WorkoutLocation {
  HOME = 'HOME',
  GYM = 'GYM',
  OUTDOOR = 'OUTDOOR',
  HYBRID = 'HYBRID',
}

export enum WorkoutSplitPreference {
  AUTO = 'AUTO',
  FULL_BODY = 'FULL_BODY',
  AB = 'AB',
  UPPER_LOWER = 'UPPER_LOWER',
  ABC = 'ABC',
  ABCD = 'ABCD',
  ABCDE = 'ABCDE',
  PUSH_PULL_LEGS = 'PUSH_PULL_LEGS',
  CIRCUIT = 'CIRCUIT',
  MOBILITY = 'MOBILITY',
}

export enum WorkoutGoal {
  GENERAL_FITNESS = 'GENERAL_FITNESS',
  HYPERTROPHY = 'HYPERTROPHY',
  STRENGTH = 'STRENGTH',
  FAT_LOSS = 'FAT_LOSS',
  ENDURANCE = 'ENDURANCE',
  MOBILITY = 'MOBILITY',
  LOWER_BODY = 'LOWER_BODY',
}

export class WorkoutProfileDto {
  @ApiProperty({ enum: Experience })
  @IsEnum(Experience)
  experience!: Experience;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek!: number;

  @ApiProperty({ type: [Number], example: [1, 3, 5], description: '0=domingo ... 6=sabado' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek!: number[];

  @ApiProperty({ enum: WorkoutLocation })
  @IsEnum(WorkoutLocation)
  location!: WorkoutLocation;

  @ApiProperty({ enum: WorkoutSplitPreference })
  @IsEnum(WorkoutSplitPreference)
  splitPreference!: WorkoutSplitPreference;

  @ApiProperty({ enum: WorkoutGoal })
  @IsEnum(WorkoutGoal)
  goal!: WorkoutGoal;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  healthConditions!: string[];

  @ApiProperty({ example: 'halteres, barra' })
  @IsString()
  @MaxLength(200)
  equipment!: string;

  @ApiProperty({ type: [String], example: ['dumbbells', 'bench'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  availableEquipment!: string[];

  @ApiProperty({ example: 45 })
  @IsInt()
  @Min(5)
  @Max(240)
  minutesPerSession!: number;
}

export class UpdateWorkoutPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ description: 'Dias do plano (estrutura app WorkoutPlan.days)', type: [Object] })
  @IsArray()
  @ArrayMaxSize(7)
  days!: unknown[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  workoutProfileSnapshot?: unknown;
}

export class CreateSessionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  planId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  workoutId!: string;
}

export class UpdateSessionDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  completedExercises?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  finishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  durationMin?: number;

  @ApiPropertyOptional({ description: 'Forca finalizacao mesmo sem finishedAt' })
  @IsOptional()
  @IsBoolean()
  finish?: boolean;
}

export class SwapExerciseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  planId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ description: '1=segunda ... 7=domingo', example: 1 })
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  exerciseId!: string;

  @ApiPropertyOptional({ description: 'Identificador estavel da alternativa.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  alternativeId?: string;

  @ApiPropertyOptional({ description: 'Compatibilidade temporaria com clientes legados.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  alternativeName?: string;
}
