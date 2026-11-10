import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
  IsBase64,
} from 'class-validator';

export class FinishTrainingDto {
  @IsString() @MinLength(1) @MaxLength(100) workoutId!: string;
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsDateString() startedAt!: string;
  @IsDateString() finishedAt!: string;
  @IsInt() @Min(0) @Max(86400) durationSec!: number;
  @IsInt() @Min(0) @Max(1000) completedSets!: number;
}
export class CoachMessageDto {
  @IsIn(['user', 'model']) role!: 'user' | 'model';
  @IsString() @MinLength(1) @MaxLength(2000) text!: string;
}
export class CoachDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CoachMessageDto)
  messages!: CoachMessageDto[];
}
export class VoiceDto {
  @IsString() @IsBase64() @MaxLength(2800000) audio!: string;
  @IsIn(['audio/m4a', 'audio/webm', 'audio/mp4']) mimeType!: string;
}
export class GenerateStoryDto {
  @IsString() @MinLength(1) @MaxLength(500) topic!: string;
}
