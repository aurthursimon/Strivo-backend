import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  token!: string;

  @ApiProperty({ example: 'novaSenhaSegura123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
