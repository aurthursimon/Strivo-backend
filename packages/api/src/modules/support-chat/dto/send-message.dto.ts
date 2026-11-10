import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'Como eu troco minha senha?' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}
