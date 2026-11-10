import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WorkoutController } from './workout.controller';
import { WorkoutService } from './workout.service';
import { WorkoutSafetyService } from './workout.safety';
import { MuscleWikiService } from './musclewiki.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [WorkoutController],
  providers: [WorkoutService, WorkoutSafetyService, MuscleWikiService],
  exports: [WorkoutService, MuscleWikiService],
})
export class WorkoutModule {}
