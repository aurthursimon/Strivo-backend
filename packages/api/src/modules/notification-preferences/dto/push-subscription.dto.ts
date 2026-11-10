import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  auth!: string;
}

class PushSubscriptionPayloadDto {
  @IsString()
  @MaxLength(2048)
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class PushSubscriptionDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionPayloadDto)
  subscription!: PushSubscriptionPayloadDto;
}
