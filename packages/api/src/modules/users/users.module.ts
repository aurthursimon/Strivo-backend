import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { BodyDataService } from './body-data.service';
import { DietModule } from '../diet';
import { WorkoutModule } from '../workout';
import { AccountDeletionAuthGuard } from './account-deletion-auth.guard';

@Module({
  imports: [JwtModule.register({}), DietModule, WorkoutModule],
  controllers: [UsersController],
  providers: [UsersService, BodyDataService, AccountDeletionAuthGuard],
  exports: [UsersService],
})
export class UsersModule {}
