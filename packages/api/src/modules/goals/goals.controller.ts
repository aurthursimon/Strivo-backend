import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GoalsService } from './goals.service';
import { CreateGoalDto, CalculateTdeeDto } from './dto';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';

@ApiTags('Goals')
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post('calculate-tdee')
  @ApiOperation({ summary: 'Calcular TDEE + macros (preview, sem auth)' })
  @ApiResponse({ status: 201, description: 'TDEE calculado' })
  calculateTdee(@Body() dto: CalculateTdeeDto) {
    return this.goalsService.calculateTdee(dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar meta (desativa anteriores)' })
  @ApiResponse({ status: 201, description: 'Meta criada' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(user.sub, dto);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Meta ativa do usuario' })
  @ApiResponse({ status: 200, description: 'Meta ativa' })
  @ApiResponse({ status: 404, description: 'Sem meta ativa' })
  findActive(@CurrentUser() user: JwtPayload) {
    return this.goalsService.findActive(user.sub);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar meta' })
  @ApiResponse({ status: 200, description: 'Meta atualizada' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') goalId: string,
    @Body() dto: Partial<CreateGoalDto>,
  ) {
    return this.goalsService.update(user.sub, goalId, dto);
  }
}
