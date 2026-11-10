import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class LogWeightDto {
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(500)
  weightKg!: number;
}

export class AddWaterDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  amountMl!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMutationId?: string;
}
