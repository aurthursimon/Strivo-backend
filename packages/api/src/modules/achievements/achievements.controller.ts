import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';
import { AchievementsService } from './achievements.service';

@ApiTags('Achievements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista conquistas e progresso do usuario' })
  @ApiResponse({ status: 200, description: 'Lista de conquistas' })
  list(@CurrentUser() user: JwtPayload) {
    return this.achievementsService.listWithProgress(user.sub);
  }
}
