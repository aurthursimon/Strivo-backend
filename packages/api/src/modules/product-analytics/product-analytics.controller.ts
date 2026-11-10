import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard, JwtAuthGuard, RateLimit } from '../../common';
import { TrackEventsBatchDto } from './dto/track-events.dto';
import {
  BreakdownQueryDto,
  DateRangeQueryDto,
  DeleteEventsQueryDto,
  RecentEventsQueryDto,
} from './dto/admin-query.dto';
import { ProductAnalyticsService } from './product-analytics.service';

@ApiTags('Product Analytics')
@Controller('product-analytics')
export class ProductAnalyticsController {
  constructor(private readonly productAnalyticsService: ProductAnalyticsService) {}

  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: 'product-analytics.events', limit: 120, windowSeconds: 3600, subject: 'ip' })
  @ApiOperation({ summary: 'Ingerir lote de eventos de analytics do funil (anonimo, sem autenticacao)' })
  async trackEvents(@Body() body: TrackEventsBatchDto, @Headers('user-agent') userAgent?: string) {
    await this.productAnalyticsService.trackEvents(body, userAgent, null);
  }

  @Get('admin/funnel-summary')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Resumo do funil: contagem por evento e views por etapa do quiz' })
  getFunnelSummary(@Query() query: DateRangeQueryDto) {
    return this.productAnalyticsService.getFunnelSummary(query.from, query.to);
  }

  @Get('admin/events-by-day')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Contagem de eventos por dia' })
  getEventsByDay(@Query() query: DateRangeQueryDto & { eventName?: string }) {
    return this.productAnalyticsService.getEventsByDay(query.from, query.to, query.eventName);
  }

  @Get('admin/breakdown')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Quebra de eventos por dimensao de atribuicao/dispositivo' })
  getBreakdown(@Query() query: BreakdownQueryDto) {
    return this.productAnalyticsService.getBreakdown(query.dimension, query.from, query.to);
  }

  @Get('admin/recent-events')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Eventos brutos mais recentes' })
  getRecentEvents(@Query() query: RecentEventsQueryDto) {
    return this.productAnalyticsService.getRecentEvents(query.limit ?? 100, query.eventName);
  }

  @Delete('admin/events')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @RateLimit({ name: 'product-analytics.delete-events', limit: 10, windowSeconds: 3600, subject: 'user' })
  @ApiOperation({ summary: '[Admin] Apagar eventos de analytics num periodo (irreversivel)' })
  deleteEvents(@Query() query: DeleteEventsQueryDto) {
    return this.productAnalyticsService.deleteEvents(query.from, query.to);
  }
}
