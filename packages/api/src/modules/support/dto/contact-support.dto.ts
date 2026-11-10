import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class ContactSupportDto {
  @ApiPropertyOptional({ example: 'Problema ao registrar dose' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  subject?: string;

  @ApiProperty({ example: 'Nao consigo registrar a dose de hoje, o app trava ao salvar.' })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  message!: string;
}
