import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE_REGEX = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)$/;
const toUpperEnum = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

export enum Glp1TreatmentStatusDto {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}

export enum Glp1RouteDto {
  SUBCUTANEOUS = 'SUBCUTANEOUS',
  ORAL = 'ORAL',
}

export enum Glp1SourceDto {
  USER = 'USER',
  PRESCRIPTION = 'PRESCRIPTION',
  CLINICIAN = 'CLINICIAN',
  PHARMACIST = 'PHARMACIST',
  OTHER = 'OTHER',
}

export enum MedicationMarketDto {
  BRAZIL = 'BRAZIL',
  UNITED_STATES = 'UNITED_STATES',
  EUROPE = 'EUROPE',
  ASIA = 'ASIA',
  INTERNATIONAL = 'INTERNATIONAL',
}

export enum Glp1DoseStatusDto {
  SCHEDULED = 'SCHEDULED',
  TAKEN = 'TAKEN',
  MISSED = 'MISSED',
  SKIPPED = 'SKIPPED',
  CANCELLED = 'CANCELLED',
}

export enum Glp1FutureScheduleActionDto {
  KEEP = 'KEEP',
  RESCHEDULE = 'RESCHEDULE',
}

export class AcceptGlp1ConsentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  accepted!: boolean;

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  @MaxLength(32)
  version!: string;

  @ApiProperty({ type: [String], example: ['treatment', 'dose', 'symptoms', 'exposure'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  scopes!: string[];

  @ApiPropertyOptional({
    description: 'Instante informado pelo cliente; o servidor grava seu proprio timestamp',
  })
  @IsOptional()
  @IsDateString()
  acceptedAt?: string;
}

export class CreateTreatmentDto {
  @ApiProperty({ example: 'semaglutide' })
  @IsString()
  @MaxLength(120)
  activeIngredient!: string;

  @ApiPropertyOptional({ example: 'Wegovy' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brandName?: string;

  @ApiProperty({ enum: Glp1RouteDto, example: 'subcutaneous' })
  @Transform(toUpperEnum)
  @IsEnum(Glp1RouteDto)
  route!: Glp1RouteDto;

  @ApiPropertyOptional({ example: 'pen' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  formulation?: string;

  @ApiPropertyOptional({ enum: MedicationMarketDto })
  @IsOptional()
  @IsEnum(MedicationMarketDto)
  medicationMarket?: MedicationMarketDto;

  @ApiPropertyOptional({ example: 'BR' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  medicationCountryCode?: string;

  @ApiProperty({ example: 0.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(1000)
  currentDoseMg!: number;

  @ApiProperty({ example: 168 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(8760)
  intervalHours!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  usualWeekday?: number;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(TIME_REGEX)
  usualLocalTime?: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  @IsString()
  @MaxLength(80)
  @Matches(TIMEZONE_REGEX, { message: 'timezone deve ser um identificador IANA' })
  timezone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ enum: Glp1TreatmentStatusDto, default: 'ACTIVE' })
  @IsOptional()
  @Transform(toUpperEnum)
  @IsEnum(Glp1TreatmentStatusDto)
  status?: Glp1TreatmentStatusDto;

  @ApiPropertyOptional({ enum: Glp1SourceDto, default: 'USER' })
  @IsOptional()
  @Transform(toUpperEnum)
  @IsEnum(Glp1SourceDto)
  source?: Glp1SourceDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 87.2 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(20)
  @Max(500)
  startWeightKg?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  baselineSymptoms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivation?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  cravingPeakDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMutationId?: string;
}

export class UpdateTreatmentDto extends PartialType(CreateTreatmentDto) {
  @ApiPropertyOptional({ description: 'Versao lida pelo cliente para concorrencia otimista' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class TreatmentTransitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class CreateDosePlanPeriodDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  treatmentId!: string;

  @ApiProperty({ example: 0.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(1000)
  doseMg!: number;

  @ApiProperty({ example: 168 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(8760)
  intervalHours!: number;

  @ApiProperty()
  @IsDateString()
  validFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ enum: Glp1SourceDto })
  @IsOptional()
  @Transform(toUpperEnum)
  @IsEnum(Glp1SourceDto)
  source?: Glp1SourceDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateDoseEventDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  treatmentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reminderAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  takenAt?: string;

  @ApiProperty({ example: 0.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(1000)
  doseMg!: number;

  @ApiProperty({ enum: Glp1DoseStatusDto })
  @Transform(toUpperEnum)
  @IsEnum(Glp1DoseStatusDto)
  status!: Glp1DoseStatusDto;

  @ApiProperty({ enum: Glp1RouteDto })
  @Transform(toUpperEnum)
  @IsEnum(Glp1RouteDto)
  route!: Glp1RouteDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  injectionSiteCode?: string;

  @ApiPropertyOptional({ description: 'Alias temporario de injectionSiteCode' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  injectionSite?: string;

  @ApiPropertyOptional({ description: 'Alias temporario de injectionSiteCode' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  siteCode?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  painLevel?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, description: 'Alias temporario de painLevel' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  pain?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: Glp1SourceDto })
  @IsOptional()
  @Transform(toUpperEnum)
  @IsEnum(Glp1SourceDto)
  source?: Glp1SourceDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMutationId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  confirmPossibleDuplicate?: boolean;

  @ApiPropertyOptional({ enum: Glp1FutureScheduleActionDto })
  @IsOptional()
  @Transform(toUpperEnum)
  @IsEnum(Glp1FutureScheduleActionDto)
  futureScheduleAction?: Glp1FutureScheduleActionDto;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @ValidateIf((dto: CreateDoseEventDto) => dto.futureScheduleAction === 'RESCHEDULE')
  @IsInt()
  @Min(1)
  @Max(365)
  futureIntervalDays?: number;

  @ApiPropertyOptional({ example: '08:00' })
  @ValidateIf((dto: CreateDoseEventDto) => dto.futureScheduleAction === 'RESCHEDULE')
  @Matches(TIME_REGEX)
  futureLocalTime?: string;

  @ApiPropertyOptional({ description: 'Versao do tratamento lida antes da reprogramacao' })
  @ValidateIf((dto: CreateDoseEventDto) => dto.futureScheduleAction === 'RESCHEDULE')
  @IsInt()
  @Min(1)
  treatmentVersion?: number;
}

export class UpdateDoseEventDto extends PartialType(CreateDoseEventDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class SetupDosePlanPeriodDto extends OmitType(CreateDosePlanPeriodDto, [
  'treatmentId',
] as const) {}

export class SetupDoseEventDto extends OmitType(CreateDoseEventDto, ['treatmentId'] as const) {}

export class CreateSymptomDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  treatmentId!: string;

  @ApiProperty({ example: 'nausea' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customName?: string;

  @ApiProperty({ minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(10)
  severity!: number;

  @ApiProperty()
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(525600)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  relatedDoseEventIds?: string[];

  @ApiPropertyOptional({ description: 'Confirmacao do conteudo de seguranca para severidade alta' })
  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  safetyContentVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMutationId?: string;
}

export class UpdateSymptomDto extends PartialType(CreateSymptomDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class UpsertReminderRuleDto {
  @ApiPropertyOptional({ description: 'Aceito por compatibilidade com o mobile atual' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  treatmentId!: string;

  @ApiProperty({ example: 'dose' })
  @IsString()
  @MaxLength(64)
  eventType!: string;

  @ApiProperty({ example: -60 })
  @IsInt()
  @Min(-525600)
  @Max(525600)
  offsetMinutes!: number;

  @ApiProperty({ default: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ example: 'local' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  channel?: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  @IsString()
  @MaxLength(80)
  @Matches(TIMEZONE_REGEX, { message: 'timezone deve ser um identificador IANA' })
  timezone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMutationId?: string;
}

export class UpsertInjectionSiteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  siteCode!: string;

  @ApiProperty()
  @IsBoolean()
  unavailable!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SetupGlp1Dto {
  @ApiProperty({ type: AcceptGlp1ConsentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AcceptGlp1ConsentDto)
  consent!: AcceptGlp1ConsentDto;

  @ApiProperty({ type: CreateTreatmentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateTreatmentDto)
  treatment!: CreateTreatmentDto;

  @ApiPropertyOptional({ type: SetupDosePlanPeriodDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SetupDosePlanPeriodDto)
  period?: SetupDosePlanPeriodDto;

  @ApiPropertyOptional({ type: SetupDoseEventDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SetupDoseEventDto)
  doseEvent?: SetupDoseEventDto;
}
