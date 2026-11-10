import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
@Module({
  imports: [JwtModule.register({})],
  controllers: [TrainingController],
  providers: [TrainingService],
})
export class TrainingModule {}
