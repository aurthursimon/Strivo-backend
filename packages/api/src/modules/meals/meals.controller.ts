import {
  Controller,
  Get,
  Post,
  Delete,
  HttpCode,
  HttpStatus,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { MealsService } from './meals.service';
import { SaveMealDto } from './dto';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';

@ApiTags('Meals')
@Controller('meals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MealsController {
  constructor(private readonly mealsService: MealsService) {}

  @Post()
  @ApiOperation({ summary: 'Salvar refeicao confirmada' })
  save(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveMealDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.mealsService.save(user.sub, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'Listar refeicoes' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'Inicio inclusivo em ISO-8601' })
  @ApiQuery({ name: 'to', required: false, description: 'Fim exclusivo em ISO-8601' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (
      (fromDate && Number.isNaN(fromDate.getTime())) ||
      (toDate && Number.isNaN(toDate.getTime())) ||
      Boolean(fromDate) !== Boolean(toDate) ||
      (fromDate && toDate && fromDate >= toDate) ||
      (fromDate && toDate && toDate.getTime() - fromDate.getTime() > 31 * 24 * 60 * 60 * 1000)
    ) {
      throw new BadRequestException({
        code: 'INVALID_MEAL_DATE_RANGE',
        message: 'Informe um intervalo valido de no maximo 31 dias.',
      });
    }
    return this.mealsService.findByUser(
      user.sub,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
      fromDate,
      toDate,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma refeicao' })
  @ApiResponse({ status: 404, description: 'Refeicao nao encontrada' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.mealsService.findById(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir refeicao' })
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.mealsService.delete(user.sub, id);
  }
}
