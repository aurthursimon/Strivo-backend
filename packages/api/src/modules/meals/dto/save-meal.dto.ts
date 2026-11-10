import {
  IsEnum,
  IsArray,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_SCAN_RESULT_ITEMS } from '../../../shared/constants';

enum MealType {
  BREAKFAST = 'BREAKFAST',
  MORNING_SNACK = 'MORNING_SNACK',
  LUNCH = 'LUNCH',
  AFTERNOON_SNACK = 'AFTERNOON_SNACK',
  DINNER = 'DINNER',
  SUPPER = 'SUPPER',
}

export class MealItemDto {
  // Shape do app (spec §2.4). Mapeado para o shape canonico do DB (sufixo G) em save().

  @ApiPropertyOptional({ description: 'Id client-side; ignorado na persistencia' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(5000)
  calories!: number;

  @ApiProperty({ description: 'Proteina em g; persistida como proteinG' })
  @IsNumber()
  @Min(0)
  @Max(500)
  protein!: number;

  @ApiProperty({ description: 'Carboidrato em g; persistido como carbsG' })
  @IsNumber()
  @Min(0)
  @Max(800)
  carbs!: number;

  @ApiProperty({ description: 'Gordura em g; persistida como fatG' })
  @IsNumber()
  @Min(0)
  @Max(500)
  fat!: number;

  @ApiPropertyOptional({ description: 'Fibra alimentar em g; persistida como fiberG' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  fiber?: number;

  @ApiProperty({ description: 'Porcao; persistida como portionG' })
  @IsNumber()
  @Min(1)
  @Max(5000)
  portion!: number;

  @ApiPropertyOptional({ description: 'Unidade da porcao; persistida como portionLabel' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(20)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  foodItemId?: string;
}

export class SaveMealDto {
  @ApiProperty({ enum: MealType })
  @IsEnum(MealType)
  type!: MealType;

  @ApiProperty({ type: [MealItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SCAN_RESULT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => MealItemDto)
  items!: MealItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  imageHash?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  aiRaw?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  wasEdited?: boolean;
}
