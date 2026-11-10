import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ example: 'Hoje completei uma semana sem perder nenhuma dose!', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @ApiPropertyOptional({ example: 'data:image/jpeg;base64,...' })
  @IsOptional()
  @IsString()
  @MaxLength(10000000)
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'data:video/mp4;base64,...' })
  @IsOptional()
  @IsString()
  @MaxLength(50000000)
  videoUrl?: string;

  @ApiPropertyOptional({ example: 'data:image/jpeg;base64,...' })
  @IsOptional()
  @IsString()
  @MaxLength(10000000)
  videoThumbnailUrl?: string;

  @ApiPropertyOptional({ example: 'PUBLIC' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  audience?: string;

  @ApiPropertyOptional({ example: 'Gym · Gold\'s' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ description: 'Workout metadata and stats' })
  @IsOptional()
  workoutMeta?: any;
}

