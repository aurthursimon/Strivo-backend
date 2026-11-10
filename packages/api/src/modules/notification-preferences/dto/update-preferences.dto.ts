import {
  IsBoolean,
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  Min,
  Max,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const HH_MM_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdatePreferencesDto {
  @ApiPropertyOptional({
    example: '07:00',
    nullable: true,
    description: 'Horario "HH:mm" ativa o lembrete; null desativa; ausente mantem.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(HH_MM_24H)
  breakfast?: string | null;

  @ApiPropertyOptional({
    example: '12:00',
    nullable: true,
    description: 'Horario "HH:mm" ativa o lembrete; null desativa; ausente mantem.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(HH_MM_24H)
  lunch?: string | null;

  @ApiPropertyOptional({
    example: '15:00',
    nullable: true,
    description: 'Horario "HH:mm" ativa o lembrete; null desativa; ausente mantem.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(HH_MM_24H)
  afternoonSnack?: string | null;

  @ApiPropertyOptional({
    example: '19:00',
    nullable: true,
    description: 'Horario "HH:mm" ativa o lembrete; null desativa; ausente mantem.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(HH_MM_24H)
  dinner?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  water?: boolean;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  waterIntervalH?: number;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM_24H)
  waterStartTime?: string;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM_24H)
  waterEndTime?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  workout?: boolean;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM_24H)
  workoutTime?: string;

  @ApiPropertyOptional({ example: [1, 3, 5], description: 'Dias da semana: 0=domingo, 6=sabado' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workoutDays?: number[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  progressCheck?: boolean;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM_24H)
  progressCheckTime?: string;

  @ApiPropertyOptional({ example: 1, description: 'Dia da semana: 0=domingo, 6=sabado' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  progressCheckWeekday?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  streakRisk?: boolean;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM_24H)
  streakRiskTime?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}
