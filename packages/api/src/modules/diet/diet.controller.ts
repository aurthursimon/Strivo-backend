import {
  Body,
  Controller,
  Get,
  GoneException,
  Param,
  Put,
  Headers,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { DietService } from './diet.service';
import { DietProfileDto, SwapMealDto } from './dto';
import { JwtAuthGuard, CurrentUser, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { normalizeAcceptLanguage } from '../../common/locale/accept-language';

@ApiTags('Diet')
@Controller('diet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DietController {
  constructor(private readonly dietService: DietService) {}

  private locale(user: JwtPayload, acceptLanguage?: string): string {
    return normalizeAcceptLanguage(acceptLanguage) ?? normalizeAcceptLanguage(user.locale) ?? 'en';
  }

  @Get('plan')
  @ApiOperation({ summary: 'Plano alimentar ativo' })
  async getPlan(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
    @Headers('accept-language') locale?: string,
  ) {
    const result = await this.dietService.getPlanState(user.sub, this.locale(user, locale));
    response.status(result.httpStatus);
    return result.body;
  }

  @Put('plan')
  @ApiOperation({ summary: 'Substituir plano alimentar ativo (apos regen de refeicao)' })
  updatePlan() {
    throw new GoneException({
      code: 'CANONICAL_PLAN_REQUIRED',
      message: 'O cliente nao pode substituir o plano completo. Use a troca de refeicao.',
    });
  }

  @Put('plan/meal')
  @RateLimit({ name: 'diet.meal.swap', limit: 30, windowSeconds: 60, subject: 'user' })
  @ApiOperation({ summary: 'Trocar refeicao por alternativa autorizada, de forma atomica' })
  swapMeal(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwapMealDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('accept-language') locale?: string,
  ) {
    return this.dietService.swapMeal(user.sub, dto, idempotencyKey, this.locale(user, locale));
  }

  @Get('recipes')
  @ApiOperation({ summary: 'Catalogo de receitas' })
  listRecipes(@CurrentUser() user: JwtPayload, @Headers('accept-language') locale?: string) {
    return this.dietService.listRecipes(user.sub, this.locale(user, locale));
  }

  @Get('recipes/:id')
  @ApiOperation({ summary: 'Detalhe de receita' })
  getRecipe(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('accept-language') locale?: string,
  ) {
    return this.dietService.getRecipe(user.sub, id, this.locale(user, locale));
  }

  @Get('profile')
  @ApiOperation({ summary: 'Perfil de dieta' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.dietService.getProfile(user.sub);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Salvar perfil de dieta' })
  async putProfile(@CurrentUser() user: JwtPayload, @Body() dto: DietProfileDto) {
    if (dto.regeneratePlan === true) {
      throw new GoneException({
        code: 'PLAN_GENERATION_SERVER_MANAGED',
        message: 'A regeneracao global do plano e gerenciada pelo backend.',
      });
    }
    return this.dietService.upsertProfile(user.sub, dto);
  }
}
