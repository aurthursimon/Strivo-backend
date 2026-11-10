import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, RateLimit, type JwtPayload } from '../../common';
import { CoachDto, FinishTrainingDto, GenerateStoryDto, VoiceDto } from './training.dto';
import { TrainingService } from './training.service';

@ApiTags('Training')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}
  @Post('workouts')
  @RateLimit({ name: 'training.finish', limit: 60, windowSeconds: 3600, subject: 'user' })
  finish(@CurrentUser() user: JwtPayload, @Body() dto: FinishTrainingDto) {
    return this.training.finish(user.sub, dto);
  }
  @Get('challenges') challenges(@CurrentUser() user: JwtPayload) {
    return this.training.challenges(user.sub);
  }
  @Get('challenges/:id')
  challengeDetail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.training.challengeDetail(user.sub, id);
  }
  @Post('challenges/:id/join') join(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.training.join(user.sub, id);
  }
  @Get('leaderboard') leaderboard(@CurrentUser() user: JwtPayload) {
    return this.training.leaderboard(user.sub);
  }
  @Post('coach')
  @RateLimit({ name: 'training.ai', limit: 30, windowSeconds: 3600, subject: 'user' })
  coach(@CurrentUser() user: JwtPayload, @Body() dto: CoachDto) {
    return this.training.coach(user.sub, dto);
  }
  @Post('voice')
  @RateLimit({ name: 'training.ai', limit: 30, windowSeconds: 3600, subject: 'user' })
  voice(@Body() dto: VoiceDto) {
    return this.training.transcribe(dto);
  }
  @Post('story')
  @RateLimit({ name: 'training.ai', limit: 30, windowSeconds: 3600, subject: 'user' })
  story(@Body() dto: GenerateStoryDto) {
    return this.training.story(dto.topic);
  }
}
