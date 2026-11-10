import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class GuestDto {
  @ApiProperty({ description: 'Identificador aleatorio da instalacao, armazenado no keychain' })
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  installationId!: string;
}
