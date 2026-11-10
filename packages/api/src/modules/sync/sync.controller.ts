import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { GetSyncBootstrapQueryDto, GetSyncChangesQueryDto, PushSyncDto } from './dto';
import { SYNC_MAX_PAYLOAD_BYTES } from './sync.constants';
import { SyncService } from './sync.service';

@ApiTags('Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync/v1')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'sync.push', limit: 30, windowSeconds: 60, subject: 'user' })
  @ApiOperation({ summary: 'Aplica um lote allowlisted de mutacoes offline' })
  push(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PushSyncDto,
    @Headers('content-length') contentLength?: string,
  ) {
    const declaredLength = contentLength ? Number(contentLength) : 0;
    if (Number.isFinite(declaredLength) && declaredLength > SYNC_MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException({
        code: 'SYNC_PAYLOAD_TOO_LARGE',
        message: `O lote de sincronizacao deve ter no maximo ${SYNC_MAX_PAYLOAD_BYTES} bytes.`,
      });
    }
    return this.syncService.push(user.sub, dto);
  }

  @Get('changes')
  @RateLimit({ name: 'sync.changes', limit: 120, windowSeconds: 60, subject: 'user' })
  @ApiOperation({ summary: 'Retorna alteracoes canonicas posteriores ao cursor' })
  getChanges(@CurrentUser() user: JwtPayload, @Query() query: GetSyncChangesQueryDto) {
    return this.syncService.getChanges(user.sub, query);
  }

  @Get('bootstrap')
  @RateLimit({ name: 'sync.bootstrap', limit: 20, windowSeconds: 60, subject: 'user' })
  @ApiOperation({ summary: 'Retorna snapshot paginado dos dominios habilitados' })
  getBootstrap(@CurrentUser() user: JwtPayload, @Query() query: GetSyncBootstrapQueryDto) {
    return this.syncService.getBootstrap(user.sub, query);
  }
}
