import { Module } from '@nestjs/common';
import { LoadTestController } from './load-test.controller';
import { LoadTestService } from './load-test.service';

@Module({
  controllers: [LoadTestController],
  providers: [LoadTestService],
})
export class LoadTestModule {}
