import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { BodyDataDto, UpdateUserDto } from './dto';
import { BodyDataService } from './body-data.service';
import { JwtAuthGuard, CurrentUser, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { normalizeAcceptLanguage } from '../../common/locale/accept-language';
import { AccountDeletionAuthGuard } from './account-deletion-auth.guard';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly bodyDataService: BodyDataService,
  ) {}

  private locale(user: JwtPayload, acceptLanguage?: string): string {
    return normalizeAcceptLanguage(acceptLanguage) ?? normalizeAcceptLanguage(user.locale) ?? 'en';
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Perfil do usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Dados do perfil' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.findMe(user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Atualizar perfil' })
  @ApiResponse({ status: 200, description: 'Perfil atualizado' })
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.sub, dto);
  }

  @Patch('me/body-data')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Atualizar dados corporais/meta e retornar planos prontos' })
  @ApiResponse({ status: 200, description: 'Perfil, meta, dieta e treino recalculados' })
  updateBodyData(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BodyDataDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.bodyDataService.update(user.sub, dto, this.locale(user, acceptLanguage));
  }

  @Post('me/reset-data')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ name: 'users.reset-data', limit: 3, windowSeconds: 86400, subject: 'user' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Resetar dados rastreados (peso, refeicoes, treinos, GLP-1, metas, comunidade) mantendo a conta',
  })
  @ApiResponse({ status: 204, description: 'Dados rastreados apagados' })
  resetData(@CurrentUser() user: JwtPayload) {
    return this.usersService.resetTrackedData(user.sub);
  }

  @Delete('me')
  @UseGuards(AccountDeletionAuthGuard)
  @RateLimit({ name: 'users.delete', limit: 3, windowSeconds: 86400, subject: 'user' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir conta, sessoes, dados relacionados e uploads pendentes' })
  @ApiResponse({ status: 204, description: 'Conta e dados ativos excluidos' })
  deleteMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.deleteAccount(user.sub, user.deletionReceiptVerified === true);
  }
}
