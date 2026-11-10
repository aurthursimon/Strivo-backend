import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSuggestionDto {
  @ApiProperty({ example: 'Seria otimo poder reordenar os suplementos na tela de dose.' })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  message!: string;
}
