import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
