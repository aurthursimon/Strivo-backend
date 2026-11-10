import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SendChatMessageDto {
  @ApiPropertyOptional({ example: 'Ola! Como vai o seu progresso?' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  text?: string;

  @ApiPropertyOptional({ example: 'data:image/jpeg;base64,...' })
  @IsOptional()
  @IsString()
  @MaxLength(10000000)
  imageUrl?: string;
}
