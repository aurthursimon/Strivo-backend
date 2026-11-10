import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTrainerProfileDto {
  @ApiPropertyOptional({ example: 'coach_alex', description: 'Trainer public handle' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  handle?: string;

  @ApiPropertyOptional({ example: 'Weight Loss & Hypertrophy Coach' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: 'Passionate about helping athletes shred fat while preserving lean muscle.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ example: ['WEIGHT_LOSS', 'STRENGTH', 'HIIT'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ example: ['NASM-CPT', 'CSCS'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional({ example: 'coach.alex' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  instagram?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/trainer.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/covers/trainer-cover.jpg' })
  @IsOptional()
  @IsString()
  coverUrl?: string;
}
