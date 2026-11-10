import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'matheus@email.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Matheus' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'senhasegura123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    example: 'A1B2C3D4',
    description: 'Codigo de indicacao (opcional). Deixe vazio se nao tiver.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return undefined;
    const t = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    return t.length >= 6 ? t : undefined;
  })
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  @Matches(/^[A-Z0-9]+$/)
  referralCode?: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Id anonimo do visitante do funil web (opcional), para associar eventos de analytics a conta criada.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : undefined))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  visitorId?: string;
}
