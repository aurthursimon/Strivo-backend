import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateMedicationDto {
  @ApiProperty({ example: 'Metformina' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: '500mg' })
  @IsString()
  @MaxLength(120)
  dosage!: string;

  @ApiProperty({ example: '2x ao dia' })
  @IsString()
  @MaxLength(120)
  frequency!: string;

  @ApiProperty({ type: [String], example: ['08:00', '20:00'] })
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @Matches(TIME_REGEX, { each: true, message: 'reminderTimes deve ser HH:mm' })
  reminderTimes!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateMedicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dosage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  frequency?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @Matches(TIME_REGEX, { each: true, message: 'reminderTimes deve ser HH:mm' })
  reminderTimes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateMedicationLogDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  medicationId!: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  skipped!: boolean;

  @ApiPropertyOptional({ description: 'Quando foi tomado (ISO); default agora' })
  @IsOptional()
  @IsDateString()
  takenAt?: string;

  @ApiPropertyOptional({ description: 'Id de mutacao do cliente; garante idempotencia' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMutationId?: string;
}

export class AcceptConsentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  accepted!: boolean;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  version?: string;
}
