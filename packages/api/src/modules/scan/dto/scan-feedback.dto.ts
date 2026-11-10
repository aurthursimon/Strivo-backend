import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ScanFeedbackItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsNumber()
  @Min(0.01)
  @Max(2_000)
  portionG!: number;
}

export class ScanFeedbackDto {
  @IsBoolean()
  edited!: boolean;

  @ValidateNested({ each: true })
  @Type(() => ScanFeedbackItemDto)
  @ArrayMaxSize(50)
  savedItems!: ScanFeedbackItemDto[];
}
