import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OAuthCodeExchangeDto {
  @ApiProperty({ description: 'Codigo de uso unico recebido no callback.' })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  code!: string;

  @ApiProperty({ description: 'State original criado pelo cliente.' })
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  state!: string;

  @ApiProperty({ description: 'Verificador PKCE que originou code_challenge.' })
  @IsString()
  @Matches(/^[A-Za-z0-9._~-]{43,128}$/)
  codeVerifier!: string;
}
