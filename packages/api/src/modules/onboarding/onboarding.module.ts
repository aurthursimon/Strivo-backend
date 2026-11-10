import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DietModule } from '../diet';
import { WorkoutModule } from '../workout';
import { Glp1Module } from '../glp1';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [JwtModule.register({}), DietModule, WorkoutModule, Glp1Module],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
