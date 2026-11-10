import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DailyLogService } from './daily-log.service';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';
import { AddWaterDto, LogWeightDto } from './dto';

@ApiTags('Daily Log')
@Controller('daily-log')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DailyLogController {
  constructor(private readonly dailyLogService: DailyLogService) {}

  @Get('today')
  @ApiOperation({ summary: 'Resumo do dia atual' })
  getToday(@CurrentUser() user: JwtPayload) {
    return this.dailyLogService.getToday(user.sub);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historico de logs' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getHistory(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.dailyLogService.getHistory(user.sub, days ? parseInt(days, 10) : 7);
  }

  @Get('water')
  @ApiOperation({ summary: 'Listar entradas de agua de hoje' })
  getTodayWater(@CurrentUser() user: JwtPayload) {
    return this.dailyLogService.getTodayWaterEntries(user.sub);
  }

  @Get('weight')
  @ApiOperation({ summary: 'Listar entradas de peso' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  listWeight(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.dailyLogService.listWeightEntries(user.sub, days ? parseInt(days, 10) : 30);
  }

  @Get(':date')
  @ApiOperation({ summary: 'Log de um dia especifico (YYYY-MM-DD)' })
  getByDate(@CurrentUser() user: JwtPayload, @Param('date') date: string) {
    return this.dailyLogService.getByDate(user.sub, date);
  }

  @Post('weight')
  @ApiOperation({ summary: 'Registrar peso do dia' })
  logWeight(@CurrentUser() user: JwtPayload, @Body() dto: LogWeightDto) {
    return this.dailyLogService.logWeight(user.sub, dto.weightKg);
  }

  @Post('water')
  @ApiOperation({ summary: 'Adicionar agua' })
  addWater(@CurrentUser() user: JwtPayload, @Body() dto: AddWaterDto) {
    return this.dailyLogService.addWater(user.sub, dto.amountMl, dto.clientMutationId, dto.date);
  }

  @Delete('water/:entryId')
  @ApiOperation({ summary: 'Remover entrada de agua' })
  removeWater(@CurrentUser() user: JwtPayload, @Param('entryId') entryId: string) {
    return this.dailyLogService.removeWater(user.sub, entryId);
  }

  @Delete('weight/:entryId')
  @ApiOperation({ summary: 'Remover entrada de peso' })
  removeWeight(@CurrentUser() user: JwtPayload, @Param('entryId') entryId: string) {
    return this.dailyLogService.removeWeight(user.sub, entryId);
  }
}
