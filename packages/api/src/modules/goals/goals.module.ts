import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
