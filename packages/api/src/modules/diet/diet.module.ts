import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DietController } from './diet.controller';
import { DietService } from './diet.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [DietController],
  providers: [DietService],
  exports: [DietService],
})
export class DietModule {}
