import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../../common';
import type { JwtPayload } from '../../common';
import {
  AcceptGlp1ConsentDto,
  CreateDoseEventDto,
  CreateDosePlanPeriodDto,
  CreateSymptomDto,
  CreateTreatmentDto,
  SetupGlp1Dto,
  TreatmentTransitionDto,
  UpdateDoseEventDto,
  UpdateSymptomDto,
  UpdateTreatmentDto,
  UpsertInjectionSiteDto,
  UpsertReminderRuleDto,
} from './dto';
import { Glp1Service } from './glp1.service';

function parseLimit(value?: string): number {
  const parsed = value ? Number.parseInt(value, 10) : 1000;
  return Number.isFinite(parsed) ? parsed : 1000;
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('glp1-consent')
export class Glp1ConsentController {
  constructor(private readonly service: Glp1Service) {}

  @Get()
  @ApiOperation({ summary: 'Obter o consentimento GLP-1 ativo' })
  get(@CurrentUser() user: JwtPayload) {
    return this.service.getConsent(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar consentimento GLP-1 versionado' })
  accept(@CurrentUser() user: JwtPayload, @Body() dto: AcceptGlp1ConsentDto) {
    return this.service.acceptConsent(user.sub, dto);
  }
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('glp1')
export class Glp1SetupController {
  constructor(private readonly service: Glp1Service) {}

  @Post('setup')
  @ApiOperation({
    summary: 'Criar consentimento, tratamento, periodo e dose inicial em uma transacao',
  })
  setup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetupGlp1Dto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.setup(user.sub, dto, idempotencyKey);
  }
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('treatments')
export class TreatmentsController {
  constructor(private readonly service: Glp1Service) {}

  @Get()
  @ApiQuery({ name: 'status', required: false })
  list(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.service.listTreatments(user.sub, status);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTreatmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createTreatment(user.sub, dto, idempotencyKey);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTreatmentDto,
  ) {
    return this.service.updateTreatment(user.sub, id, dto);
  }

  @Post(':id/pause')
  pause(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: TreatmentTransitionDto,
  ) {
    return this.service.transitionTreatment(user.sub, id, 'PAUSED', dto);
  }

  @Post(':id/resume')
  resume(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: TreatmentTransitionDto,
  ) {
    return this.service.transitionTreatment(user.sub, id, 'ACTIVE', dto);
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: TreatmentTransitionDto,
  ) {
    return this.service.transitionTreatment(user.sub, id, 'COMPLETED', dto);
  }
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dose-plan-periods')
export class DosePlanPeriodsController {
  constructor(private readonly service: Glp1Service) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Query('treatmentId') treatmentId: string) {
    return this.service.listDosePlanPeriods(user.sub, treatmentId);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDosePlanPeriodDto) {
    return this.service.createDosePlanPeriod(user.sub, dto);
  }
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dose-events')
export class DoseEventsController {
  constructor(private readonly service: Glp1Service) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('treatmentId') treatmentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listDoseEvents(user.sub, treatmentId, parseLimit(limit));
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDoseEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createDoseEvent(user.sub, dto, idempotencyKey);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDoseEventDto,
  ) {
    return this.service.updateDoseEvent(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.deleteDoseEvent(user.sub, id);
  }

  @Post(':id/mark-missed')
  markMissed(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.transitionDoseEvent(user.sub, id, 'MISSED');
  }

  @Post(':id/mark-skipped')
  markSkipped(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.transitionDoseEvent(user.sub, id, 'SKIPPED');
  }
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('symptoms')
export class SymptomsController {
  constructor(private readonly service: Glp1Service) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('treatmentId') treatmentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listSymptoms(user.sub, treatmentId, parseLimit(limit));
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSymptomDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createSymptom(user.sub, dto, idempotencyKey);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateSymptomDto) {
    return this.service.updateSymptom(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.deleteSymptom(user.sub, id);
  }
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reminder-rules')
export class ReminderRulesController {
  constructor(private readonly service: Glp1Service) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('treatmentId') treatmentId?: string) {
    return this.service.listReminderRules(user.sub, treatmentId);
  }

  @Post()
  upsert(@CurrentUser() user: JwtPayload, @Body() dto: UpsertReminderRuleDto) {
    return this.service.upsertReminderRule(user.sub, dto);
  }
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('injection-sites')
export class InjectionSitesController {
  constructor(private readonly service: Glp1Service) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listInjectionSites(user.sub);
  }

  @Post()
  upsert(@CurrentUser() user: JwtPayload, @Body() dto: UpsertInjectionSiteDto) {
    return this.service.upsertInjectionSite(user.sub, dto);
  }
}

@ApiTags('GLP-1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('timeline')
export class TimelineController {
  constructor(private readonly service: Glp1Service) {}

  @Get()
  get(
    @CurrentUser() user: JwtPayload,
    @Query('treatmentId') treatmentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.timeline(user.sub, treatmentId, parseLimit(limit));
  }
}
