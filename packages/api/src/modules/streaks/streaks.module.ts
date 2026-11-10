import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AchievementsModule } from '../achievements';
import { StreaksController } from './streaks.controller';
import { StreaksService } from './streaks.service';

@Module({
  imports: [JwtModule.register({}), AchievementsModule],
  controllers: [StreaksController],
  providers: [StreaksService],
  exports: [StreaksService],
})
export class StreaksModule {}
