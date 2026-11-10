import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GoogleMobileDto {
  @ApiProperty({ description: 'Google ID token from native Sign-In SDK' })
  @IsString()
  @MaxLength(8192)
  idToken!: string;

  @ApiPropertyOptional({ description: 'Nonce enviado ao Google no inicio da autenticacao' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  nonce?: string;
}
