import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';
import { ReferralsService } from './referrals.service';

@ApiTags('Referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Codigo de indicacao e estatisticas' })
  @ApiResponse({ status: 200, description: 'Dados de indicacao' })
  getMine(@CurrentUser() user: JwtPayload) {
    return this.referralsService.getReferralDashboard(user.sub);
  }
}
