import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('weekly')
  @ApiOperation({ summary: 'Resumo semanal de calorias e nutrientes' })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Offset da semana (0 = atual, -1 = anterior)',
  })
  @ApiResponse({ status: 200, description: 'Resumo semanal retornado com sucesso' })
  getWeeklySummary(@CurrentUser() user: JwtPayload, @Query('offset') offset?: string) {
    return this.analyticsService.getWeeklySummary(user.sub, offset ? parseInt(offset, 10) : 0);
  }

  @Get('weight-trend')
  @ApiOperation({ summary: 'Tendencia de peso ao longo do tempo' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Numero de dias (padrao: 30)',
  })
  @ApiResponse({ status: 200, description: 'Dados de tendencia de peso retornados com sucesso' })
  getWeightTrend(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analyticsService.getWeightTrend(user.sub, days ? parseInt(days, 10) : 30);
  }
}
