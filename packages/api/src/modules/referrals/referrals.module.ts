import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
