import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TrainerController } from './trainer.controller';
import { TrainerService } from './trainer.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [TrainerController],
  providers: [TrainerService],
  exports: [TrainerService],
})
export class TrainerModule {}
