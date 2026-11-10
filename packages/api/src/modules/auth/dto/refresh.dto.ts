import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token (enviado via cookie)' })
  @IsString()
  @MaxLength(8192)
  token!: string;
}
