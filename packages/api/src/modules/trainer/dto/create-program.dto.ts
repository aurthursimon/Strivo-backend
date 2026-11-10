import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProgramExerciseItemDto {
  @ApiProperty({ example: 'Barbell Squats' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 4, default: 3 })
  @IsOptional()
  @IsNumber()
  sets?: number;

  @ApiPropertyOptional({ example: '12 reps' })
  @IsOptional()
  @IsString()
  reps?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  restSec?: number;

  @ApiPropertyOptional({ example: 'Explosive ascent, controlled descent' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  exerciseId?: string;
}

export class ProgramDayDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  dayNumber!: number;

  @ApiProperty({ example: 'Day 1: Full Body Metabolic Burn' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: 'Full Body & Core Calorie Shred' })
  @IsOptional()
  @IsString()
  focus?: string;

  @ApiProperty({ type: [ProgramExerciseItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramExerciseItemDto)
  exercises!: ProgramExerciseItemDto[];
}

export class CreateTrainerProgramDto {
  @ApiProperty({ example: 'Weight Loss Accelerated Shred' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ example: '4-week progressive metabolic strength routine designed to burn fat and preserve tone.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'WEIGHT_LOSS', default: 'WEIGHT_LOSS' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ example: 'INTERMEDIATE', default: 'INTERMEDIATE' })
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional({ example: 4, default: 4 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationWeeks?: number;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiProperty({ type: [ProgramDayDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramDayDto)
  days!: ProgramDayDto[];
}

export class UpdateTrainerProgramDto extends CreateTrainerProgramDto {}
