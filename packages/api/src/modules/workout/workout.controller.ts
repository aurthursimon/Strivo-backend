import {
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Headers,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { WorkoutService } from './workout.service';
import { MuscleWikiService } from './musclewiki.service';
import { CreateSessionDto, SwapExerciseDto, UpdateSessionDto, WorkoutProfileDto } from './dto';
import { JwtAuthGuard, CurrentUser, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { normalizeAcceptLanguage } from '../../common/locale/accept-language';

@ApiTags('Workout')
@Controller('workout')
export class WorkoutController {
  constructor(
    private readonly workoutService: WorkoutService,
    private readonly muscleWikiService: MuscleWikiService,
  ) {}

  private locale(user: JwtPayload, acceptLanguage?: string): string {
    return normalizeAcceptLanguage(acceptLanguage) ?? normalizeAcceptLanguage(user.locale) ?? 'en';
  }

  @Get('exercises/search')
  @ApiOperation({ summary: 'Search exercise library via MuscleWiki' })
  searchExercises(
    @Query('q') query?: string,
    @Query('muscle') muscle?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.muscleWikiService.searchExercises({
      search: query,
      muscle,
      category,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('exercises/detail')
  @ApiOperation({ summary: 'Get exercise walkthrough, affected muscles, steps & video demonstrations' })
  getExerciseDetail(@Query('nameOrId') nameOrId: string) {
    return this.muscleWikiService.getExerciseDetail(nameOrId);
  }

  @Get('exercises/muscles')
  @ApiOperation({ summary: 'Get list of targeted muscle groups' })
  getMuscles() {
    return this.muscleWikiService.getMuscles();
  }

  @Get('plan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Plano de treino ativo' })
  async getPlan(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const result = await this.workoutService.getPlanState(
      user.sub,
      this.locale(user, acceptLanguage),
    );
    response.status(result.httpStatus);
    return result.body;
  }

  @Put('plan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Substituir plano de treino ativo' })
  updatePlan() {
    throw new GoneException({
      code: 'CANONICAL_PLAN_REQUIRED',
      message: 'O cliente nao pode substituir o plano completo. Use a troca de exercicio.',
    });
  }

  @Put('plan/exercise')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RateLimit({ name: 'workout.exercise.swap', limit: 30, windowSeconds: 60, subject: 'user' })
  @ApiOperation({ summary: 'Trocar exercicio por alternativa autorizada, de forma atomica' })
  swapExercise(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwapExerciseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.workoutService.swapExercise(
      user.sub,
      dto,
      idempotencyKey,
      this.locale(user, acceptLanguage),
    );
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil de treino' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.workoutService.getProfile(user.sub);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Personalizar perfil e montar o plano de treino imediatamente' })
  @ApiResponse({ status: 422, description: 'Condicao de saude bloqueia treino' })
  putProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: WorkoutProfileDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.workoutService.generateReadyPlan(user.sub, dto, this.locale(user, acceptLanguage));
  }

  @Post('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar sessao de treino' })
  createSession(@CurrentUser() user: JwtPayload, @Body() dto: CreateSessionDto) {
    return this.workoutService.createSession(user.sub, dto);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sessoes de treino' })
  listSessions(@CurrentUser() user: JwtPayload) {
    return this.workoutService.listSessions(user.sub);
  }

  @Get('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalhe da sessao' })
  getSession(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.workoutService.getSession(user.sub, id);
  }

  @Put('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar/finalizar sessao' })
  updateSession(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.workoutService.updateSession(user.sub, id, dto);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir sessao de treino' })
  deleteSession(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.workoutService.deleteSession(user.sub, id);
  }
}
