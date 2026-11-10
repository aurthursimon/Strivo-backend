import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MedicationsService } from './medications.service';
import {
  AcceptConsentDto,
  CreateMedicationDto,
  CreateMedicationLogDto,
  UpdateMedicationDto,
} from './dto';
import { JwtAuthGuard, CurrentUser } from '../../common';
import type { JwtPayload } from '../../common';

@ApiTags('Medications')
@Controller('medication-consent')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MedicationConsentController {
  constructor(private readonly service: MedicationsService) {}

  @Get()
  @ApiOperation({ summary: 'Estado do consentimento de medicamentos' })
  @ApiResponse({ status: 200, description: '{ acceptedAt?, version? }' })
  get(@CurrentUser() user: JwtPayload) {
    return this.service.getConsent(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar consentimento (obrigatorio antes de salvar medicamentos)' })
  @ApiResponse({ status: 201, description: '{ acceptedAt, version }' })
  accept(@CurrentUser() user: JwtPayload, @Body() dto: AcceptConsentDto) {
    return this.service.acceptConsent(user.sub, dto);
  }
}

@ApiTags('Medications')
@Controller('medications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MedicationsController {
  constructor(private readonly service: MedicationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar medicamentos do usuario' })
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listMedications(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Criar medicamento (exige consentimento)' })
  @ApiResponse({ status: 403, description: 'Consentimento ausente' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMedicationDto) {
    return this.service.createMedication(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar medicamento (exige consentimento)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMedicationDto,
  ) {
    return this.service.updateMedication(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir medicamento (soft delete)' })
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.deleteMedication(user.sub, id);
  }
}

@ApiTags('Medications')
@Controller('medication-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MedicationLogsController {
  constructor(private readonly service: MedicationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar registros de doses' })
  @ApiQuery({ name: 'medicationId', required: false })
  list(@CurrentUser() user: JwtPayload, @Query('medicationId') medicationId?: string) {
    return this.service.listLogs(user.sub, medicationId);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar dose tomada/pulada (exige consentimento)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMedicationLogDto) {
    return this.service.createLog(user.sub, dto);
  }
}
