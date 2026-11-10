import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { normalizeAcceptLanguage } from '../../common/locale/accept-language';
import { OnboardingService } from './onboarding.service';
import { CompleteOnboardingDto } from './dto';

@ApiTags('Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  private locale(user: JwtPayload, acceptLanguage?: string): string {
    return normalizeAcceptLanguage(acceptLanguage) ?? normalizeAcceptLanguage(user.locale) ?? 'en';
  }

  @Post('preview')
  @RateLimit({ name: 'onboarding.preview', limit: 10, windowSeconds: 3600, subject: 'ip' })
  @ApiOperation({ summary: 'Gerar uma previa anonima e nao persistida do plano' })
  @ApiResponse({ status: 201, description: 'Previa de metas, dieta e treino gerada' })
  preview(@Body() dto: CompleteOnboardingDto, @Headers('accept-language') acceptLanguage?: string) {
    return this.onboardingService.preview(
      dto,
      normalizeAcceptLanguage(acceptLanguage) ?? normalizeAcceptLanguage(dto.locale) ?? 'en',
    );
  }

  @Post('complete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @RateLimit({ name: 'onboarding.complete', limit: 50, windowSeconds: 3600, subject: 'user' })
  @ApiOperation({ summary: 'Finalizar onboarding e retornar meta, dieta e treino prontos' })
  @ApiResponse({ status: 201, description: 'Onboarding finalizado com planos ativos' })
  complete(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CompleteOnboardingDto,
    @Headers('accept-language') acceptLanguage?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.onboardingService.complete(
      user.sub,
      dto,
      this.locale(user, acceptLanguage),
      idempotencyKey,
    );
  }

  @Post('plans/ensure')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @RateLimit({ name: 'onboarding.plans.ensure', limit: 30, windowSeconds: 3600, subject: 'user' })
  @ApiOperation({ summary: 'Garantir provisionamento idempotente de dieta e treino' })
  @ApiResponse({ status: 201, description: 'Estado atual dos planos e recuperacao agendada' })
  ensurePlans(
    @CurrentUser() user: JwtPayload,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.onboardingService.ensurePlans(user.sub, this.locale(user, acceptLanguage));
  }
}
