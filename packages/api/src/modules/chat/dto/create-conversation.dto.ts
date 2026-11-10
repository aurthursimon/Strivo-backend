import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({ description: 'ID do usuario destinatario' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  recipientUserId!: string;
}
