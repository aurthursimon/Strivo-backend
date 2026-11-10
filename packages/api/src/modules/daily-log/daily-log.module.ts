import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DailyLogController } from './daily-log.controller';
import { DailyLogService } from './daily-log.service';
import { SyncModule } from '../sync';

@Module({
  imports: [JwtModule.register({}), SyncModule],
  controllers: [DailyLogController],
  providers: [DailyLogService],
  exports: [DailyLogService],
})
export class DailyLogModule {}
