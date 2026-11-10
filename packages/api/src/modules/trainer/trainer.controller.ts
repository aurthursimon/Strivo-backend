import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../../common';
import type { JwtPayload } from '../../common';
import {
  CreateTrainerExerciseDto,
  CreateTrainerProgramDto,
  UpdateTrainerProfileDto,
  UpdateTrainerProgramDto,
} from './dto';
import { TrainerService } from './trainer.service';

@ApiTags('Trainers & Programs')
@Controller('trainers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TrainerController {
  constructor(private readonly trainerService: TrainerService) {}

  @Get()
  @ApiOperation({ summary: 'List public trainers with search & specialty filters' })
  getPublicTrainers(
    @Query('search') search?: string,
    @Query('specialty') specialty?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trainerService.getPublicTrainers(
      search,
      specialty,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('me/profile')
  @ApiOperation({ summary: "Get current user's trainer profile" })
  getMyTrainerProfile(@CurrentUser() user: JwtPayload) {
    return this.trainerService.getMyTrainerProfile(user.sub);
  }

  @Put('me/profile')
  @ApiOperation({ summary: "Update current user's trainer profile" })
  updateMyTrainerProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTrainerProfileDto,
  ) {
    return this.trainerService.updateMyTrainerProfile(user.sub, dto);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: "Update user & trainer profile avatar image" })
  updateAvatar(
    @CurrentUser() user: JwtPayload,
    @Body('avatarUrl') avatarUrl: string,
  ) {
    return this.trainerService.updateAvatar(user.sub, avatarUrl);
  }

  @Get('me/exercises')
  @ApiOperation({ summary: "List current trainer's custom exercises" })
  listMyExercises(@CurrentUser() user: JwtPayload) {
    return this.trainerService.listMyExercises(user.sub);
  }

  @Post('me/exercises')
  @ApiOperation({ summary: "Create a custom exercise for trainer library" })
  createExercise(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTrainerExerciseDto,
  ) {
    return this.trainerService.createExercise(user.sub, dto);
  }

  @Delete('me/exercises/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete custom exercise" })
  deleteExercise(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.trainerService.deleteExercise(user.sub, id);
  }

  @Get('me/programs')
  @ApiOperation({ summary: "List programs created by current trainer" })
  getMyPrograms(@CurrentUser() user: JwtPayload) {
    return this.trainerService.getMyPrograms(user.sub);
  }

  @Post('me/programs')
  @ApiOperation({ summary: "Create a multi-day workout program / session" })
  createProgram(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTrainerProgramDto,
  ) {
    return this.trainerService.createProgram(user.sub, dto);
  }

  @Put('me/programs/:id')
  @ApiOperation({ summary: "Update an authored workout program" })
  updateProgram(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTrainerProgramDto,
  ) {
    return this.trainerService.updateProgram(user.sub, id, dto);
  }

  @Delete('me/programs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete an authored workout program" })
  deleteProgram(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.trainerService.deleteProgram(user.sub, id);
  }

  @Get('programs/enrolled/me')
  @ApiOperation({ summary: "Get athlete's currently enrolled trainer programs" })
  getMyEnrolledPrograms(@CurrentUser() user: JwtPayload) {
    return this.trainerService.getMyEnrolledPrograms(user.sub);
  }

  @Get('challenges')
  @ApiOperation({ summary: 'Get active community fitness challenges' })
  getChallenges(@CurrentUser() user: JwtPayload) {
    return this.trainerService.getFeaturedChallenges(user?.sub);
  }

  @Get('programs/featured')
  @ApiOperation({ summary: 'Get featured public workout programs' })
  getFeaturedPrograms(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trainerService.getFeaturedPrograms(
      search,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('programs/:id')
  @ApiOperation({ summary: "Get program details, day sessions, and enrollment state" })
  getProgramById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.trainerService.getProgramById(id, user.sub);
  }

  @Get('programs/:id/participants')
  @ApiOperation({ summary: 'Real joined users ranked by completed program days' })
  getProgramParticipants(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('page') page?: string) {
    return this.trainerService.getProgramParticipants(id, user.sub, page === undefined ? 1 : Number(page));
  }

  @Post('programs/:id/join')
  @ApiOperation({ summary: "Join a trainer's program / session" })
  joinProgram(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.trainerService.joinProgram(user.sub, id);
  }

  @Delete('programs/:id/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Leave/unenroll from a trainer program" })
  leaveProgram(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.trainerService.leaveProgram(user.sub, id);
  }

  @Post('programs/:id/complete-day')
  @ApiOperation({ summary: "Mark a day completed in an enrolled program" })
  completeProgramDay(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('dayNumber') dayNumber: number,
  ) {
    return this.trainerService.completeProgramDay(user.sub, id, dayNumber);
  }

  @Get(':id')
  @ApiOperation({ summary: "Get public trainer profile with programs and exercises" })
  getTrainerById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.trainerService.getTrainerById(id, user.sub);
  }
}
