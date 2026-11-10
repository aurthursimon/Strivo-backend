import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'Parabens, continue assim!' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;

  // Omitted/undefined = a top-level comment on the post. Set = a reply to
  // that comment. CommunityService.createComment rejects it when the target
  // is itself already a reply, enforcing exactly one level.
  @ApiPropertyOptional({ example: 'clx1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  parentCommentId?: string;
}
