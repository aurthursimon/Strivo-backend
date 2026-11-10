import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum MealType {
  BREAKFAST = 'BREAKFAST',
  MORNING_SNACK = 'MORNING_SNACK',
  LUNCH = 'LUNCH',
  AFTERNOON_SNACK = 'AFTERNOON_SNACK',
  DINNER = 'DINNER',
  SUPPER = 'SUPPER',
}

export class DietProfileDto {
  @ApiProperty({ enum: ['LOSE', 'MAINTAIN', 'GAIN'] })
  @IsString()
  @MaxLength(20)
  goalType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dietType?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  restrictions!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  dislikedFoods!: string[];

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(8)
  mealsPerDay!: number;

  @ApiProperty({ example: 2000 })
  @IsInt()
  @Min(800)
  @Max(8000)
  targetCalories!: number;

  @ApiPropertyOptional({ description: 'Se true, salva o perfil e retorna um plano ativo novo.' })
  @IsOptional()
  @IsBoolean()
  regeneratePlan?: boolean;
}

export class RegenMealDto {
  @ApiProperty({ description: '1=segunda ... 7=domingo', example: 1 })
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek!: number;

  @ApiProperty({ enum: MealType })
  @IsEnum(MealType)
  mealType!: MealType;
}

export class UpdateMealPlanDto {
  @ApiPropertyOptional({ description: 'Id do plano (ignorado; usa o plano ativo)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @ApiProperty({ description: 'Dias do plano (estrutura app MealPlan.days)', type: [Object] })
  @IsArray()
  @ArrayMaxSize(7)
  days!: unknown[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  dietProfileSnapshot?: unknown;
}

export class SwapMealDto {
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

  @ApiProperty({ enum: MealType })
  @IsEnum(MealType)
  mealType!: MealType;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  alternativeRecipeId!: string;
}
