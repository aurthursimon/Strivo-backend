import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StreaksService } from './streaks.service';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';

@ApiTags('Streaks')
@Controller('streaks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  @Get()
  @ApiOperation({ summary: 'Streak atual do usuario' })
  getStreak(@CurrentUser() user: JwtPayload) {
    return this.streaksService.getStreak(user.sub);
  }
}
