import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BillingModule } from '../billing/billing.module';
import { SyncController } from './sync.controller';
import { SyncHandlerRegistry } from './sync-handler.registry';
import { SyncService } from './sync.service';
import { SyncMaintenanceService } from './sync-maintenance.service';
import {
  Glp1DoseCreateSyncHandler,
  Glp1SymptomCreateSyncHandler,
  MealCreateSyncHandler,
  NotificationPreferencesSetSyncHandler,
  WaterAddSyncHandler,
  WeightLogSyncHandler,
  WorkoutSessionFinishSyncHandler,
  WorkoutSessionStartSyncHandler,
} from './handlers';

@Module({
  imports: [JwtModule.register({}), BillingModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    SyncMaintenanceService,
    SyncHandlerRegistry,
    WaterAddSyncHandler,
    WeightLogSyncHandler,
    MealCreateSyncHandler,
    WorkoutSessionStartSyncHandler,
    WorkoutSessionFinishSyncHandler,
    Glp1DoseCreateSyncHandler,
    Glp1SymptomCreateSyncHandler,
    NotificationPreferencesSetSyncHandler,
  ],
  exports: [SyncService, SyncMaintenanceService],
})
export class SyncModule {}
