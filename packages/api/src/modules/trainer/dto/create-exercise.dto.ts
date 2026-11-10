import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTrainerExerciseDto {
  @ApiProperty({ example: 'Tempo Dumbbell Squats' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'STRENGTH', default: 'STRENGTH' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: ['Quads', 'Glutes'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  primaryMuscles?: string[];

  @ApiPropertyOptional({ example: 'DUMBBELL', default: 'BODYWEIGHT' })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiPropertyOptional({ example: 'Descend for 3 seconds, pause at bottom, drive up explosively.' })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  instructions?: string;

  @ApiPropertyOptional({ example: 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'https://youtube.com/watch?v=...' })
  @IsOptional()
  @IsString()
  videoUrl?: string;
}
