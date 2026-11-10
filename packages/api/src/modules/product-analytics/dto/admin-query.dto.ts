import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const BREAKDOWN_DIMENSIONS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'country',
  'ageRange',
  'platform',
  'os',
  'browser',
  'deviceType',
] as const;

export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'ISO date, inclusive. Default: 7 dias atras.' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive. Default: agora.' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class BreakdownQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: BREAKDOWN_DIMENSIONS })
  @IsIn(BREAKDOWN_DIMENSIONS)
  dimension!: BreakdownDimension;
}

export class DeleteEventsQueryDto {
  // Required, unlike DateRangeQueryDto's from/to - a destructive delete must
  // always be scoped to an explicit range (the admin page's own currently-
  // selected range), never silently defaulting to "everything".
  @ApiProperty({ description: 'ISO date, inclusive.' })
  @IsString()
  from!: string;

  @ApiProperty({ description: 'ISO date, inclusive.' })
  @IsString()
  to!: string;
}

export class RecentEventsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventName?: string;

  @ApiPropertyOptional({ default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
