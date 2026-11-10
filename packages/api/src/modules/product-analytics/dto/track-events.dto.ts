import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const TRACKED_EVENT_NAMES = [
  'landing_viewed',
  'landing_cta_clicked',
  'quiz_started',
  'quiz_step_viewed',
  'quiz_completed',
  'result_viewed',
  'account_created',
  'plan_viewed',
  'plan_selected',
  'checkout_started',
  'checkout_completed',
  'download_clicked',
  'premium_activated',
] as const;

export type TrackedEventName = (typeof TRACKED_EVENT_NAMES)[number];

export const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;

export class TrackEventDto {
  @ApiProperty({ enum: TRACKED_EVENT_NAMES })
  @IsIn(TRACKED_EVENT_NAMES)
  eventName!: TrackedEventName;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stepId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  stepIndex?: number;

  @ApiPropertyOptional({ enum: ['forward', 'back'] })
  @IsOptional()
  @IsIn(['forward', 'back'])
  direction?: 'forward' | 'back';

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

export class TrackEventsBatchDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  @MaxLength(100)
  visitorId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmMedium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmCampaign?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fbclid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ttclid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  gclid?: string;

  @ApiPropertyOptional({
    description:
      'Pais de faturamento escolhido pelo visitante na tela de planos (nao geolocalizacao por IP).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional({
    enum: AGE_RANGES,
    description: 'Faixa etaria calculada no cliente a partir da data de nascimento do quiz.',
  })
  @IsOptional()
  @IsIn(AGE_RANGES)
  ageRange?: (typeof AGE_RANGES)[number];

  @ApiProperty({ type: [TrackEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events!: TrackEventDto[];
}
