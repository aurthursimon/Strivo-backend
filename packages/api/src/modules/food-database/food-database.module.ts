import { Module } from '@nestjs/common';
import { FoodDatabaseController } from './food-database.controller';
import { FoodDatabaseService } from './food-database.service';

@Module({
  controllers: [FoodDatabaseController],
  providers: [FoodDatabaseService],
  exports: [FoodDatabaseService],
})
export class FoodDatabaseModule {}
