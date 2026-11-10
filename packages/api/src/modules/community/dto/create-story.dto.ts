import {
  IsBoolean, IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStoryDto {
  @IsOptional()
  @IsBoolean()
  workoutStatus?: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientRequestId?: string;

  @ApiProperty({ example: 'https://images.unsplash.com/... or data:image/jpeg;base64,...' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50000000)
  mediaUrl!: string;

  @ApiPropertyOptional({ example: 'IMAGE', enum: ['IMAGE', 'VIDEO', 'TEXT'] })
  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO', 'TEXT'])
  mediaType?: 'IMAGE' | 'VIDEO' | 'TEXT';

  @ApiPropertyOptional({ example: 'Morning workout complete! 🔥' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Duration in seconds (default 5 for image, up to 15 for video)',
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(30)
  duration?: number;
}
