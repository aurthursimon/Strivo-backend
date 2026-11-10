import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV_TOKEN, type Env } from '../../config';
import { PrismaService } from '../../prisma';
import { BillingModule } from '../billing/billing.module';
import { SCAN_ANALYZER, createScanAnalyzer } from './scan-analyzer.provider';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

@Module({
  imports: [JwtModule.register({}), BillingModule],
  controllers: [ScanController],
  providers: [
    ScanService,
    {
      provide: SCAN_ANALYZER,
      useFactory: (env: Env, prisma: PrismaService) => createScanAnalyzer(env, prisma),
      inject: [ENV_TOKEN, PrismaService],
    },
  ],
})
export class ScanModule {}
