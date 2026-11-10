import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AchievementsController],
  providers: [AchievementsService],
  exports: [AchievementsService],
})
export class AchievementsModule {}
