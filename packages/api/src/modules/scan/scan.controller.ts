import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { ScanFeedbackDto } from './dto/scan-feedback.dto';
import { ScanService } from './scan.service';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@ApiTags('Scan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scans')
export class ScanController {
  constructor(private readonly scans: ScanService) {}

  @Get('access')
  @ApiOperation({ summary: 'Cota de scans do usuario autenticado' })
  getAccess(@CurrentUser() user: JwtPayload) {
    return this.scans.getAccess(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'scan.create', limit: 60, windowSeconds: 3_600, subject: 'user' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'Envia uma foto de refeicao para analise' })
  create(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException({ code: 'IMAGE_REQUIRED', message: 'Imagem obrigatoria.' });
    }
    return this.scans.create({
      userId: user.sub,
      idempotencyKey: idempotencyKey ?? '',
      contentType: file.mimetype,
      image: file.buffer,
      locale: acceptLanguage ?? 'en',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Status/resultado de um scan' })
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scans.get(user.sub, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela um scan em processamento' })
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scans.cancel(user.sub, id);
  }

  @Post(':id/feedback')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ name: 'scan.feedback', limit: 30, windowSeconds: 3_600, subject: 'user' })
  @ApiOperation({ summary: 'Registra correcao de porcao para calibrar scans futuros' })
  feedback(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: ScanFeedbackDto,
  ) {
    return this.scans.feedback(user.sub, id, body);
  }
}
