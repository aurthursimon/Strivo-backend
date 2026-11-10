import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProductAnalyticsController } from './product-analytics.controller';
import { ProductAnalyticsService } from './product-analytics.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ProductAnalyticsController],
  providers: [ProductAnalyticsService],
  exports: [ProductAnalyticsService],
})
export class ProductAnalyticsModule {}
