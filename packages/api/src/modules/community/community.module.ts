import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
