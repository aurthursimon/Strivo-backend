import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AppleMobileDto {
  @ApiProperty({ description: 'Apple identityToken retornado pelo Sign in with Apple' })
  @IsString()
  @MaxLength(8192)
  identityToken!: string;

  @ApiProperty({ description: 'Nonce enviado no pedido Apple e vinculado ao identityToken' })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  nonce!: string;

  @ApiPropertyOptional({
    description: 'Codigo curto usado pelo backend para obter e revogar tokens Apple',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  authorizationCode?: string;

  @ApiPropertyOptional({ description: 'Nome retornado pela Apple na primeira autorizacao' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;
}
