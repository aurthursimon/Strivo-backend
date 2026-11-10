import { Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { LoadTestService } from './load-test.service';

@ApiExcludeController()
@Controller('load-test')
export class LoadTestController {
  constructor(private readonly loadTestService: LoadTestService) {}

  @Get('ping')
  ping(@Headers('x-load-test-key') key: string | undefined) {
    return this.loadTestService.ping(key);
  }

  @Get('db')
  db(@Headers('x-load-test-key') key: string | undefined) {
    return this.loadTestService.db(key);
  }

  @Post('db-write')
  dbWrite(@Headers('x-load-test-key') key: string | undefined) {
    return this.loadTestService.dbWrite(key);
  }

  @Post('db-mixed')
  dbMixed(
    @Headers('x-load-test-key') key: string | undefined,
    @Query('reads') reads: string | undefined,
    @Query('writes') writes: string | undefined,
  ) {
    return this.loadTestService.dbMixed(key, reads, writes);
  }

  @Post('db-cleanup')
  dbCleanup(@Headers('x-load-test-key') key: string | undefined) {
    return this.loadTestService.dbCleanup(key);
  }
}
