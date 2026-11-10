import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SYNC_MAX_CHANGES_PER_PAGE,
  SYNC_MAX_MUTATIONS_PER_BATCH,
  SYNC_OPERATIONS,
} from '../sync.constants';

export class SyncMutationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  mutationId!: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  sequence!: number;

  @ApiProperty({
    example: 'WATER_ADD',
    enum: Object.values(SYNC_OPERATIONS),
    description:
      'Operacao allowlisted. Tipos desconhecidos recebem rejeicao terminal por item, sem invalidar o lote.',
  })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{0,63}$/)
  type!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  entityId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  baseVersion?: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  occurredAt!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description:
      'mutationIds que precisam estar aplicadas. WORKOUT_SESSION_FINISH exige o START da mesma sessao.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  dependsOn?: string[];

  @ApiProperty({ type: Object })
  @IsObject()
  payload!: Record<string, unknown>;
}

export class PushSyncDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  installationId!: string;

  @ApiProperty({ type: [SyncMutationDto], maxItems: SYNC_MAX_MUTATIONS_PER_BATCH })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SYNC_MAX_MUTATIONS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => SyncMutationDto)
  mutations!: SyncMutationDto[];
}

export class GetSyncBootstrapQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor opaco retornado por uma pagina anterior do mesmo bootstrap.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: SYNC_MAX_CHANGES_PER_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SYNC_MAX_CHANGES_PER_PAGE)
  limit?: number;
}

export class GetSyncChangesQueryDto {
  @ApiProperty({
    description: 'Revisao global retornada pelo servidor. Use 0 somente para solicitar bootstrap.',
    example: '42',
  })
  @IsString()
  @MaxLength(20)
  @Matches(/^(0|[1-9]\d{0,19})$/)
  afterRevision!: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: SYNC_MAX_CHANGES_PER_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SYNC_MAX_CHANGES_PER_PAGE)
  limit?: number;
}
