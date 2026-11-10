import { Injectable } from '@nestjs/common';
import type { SyncOperation } from './sync.constants';
import type { SyncOperationHandler } from './sync.types';
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

@Injectable()
export class SyncHandlerRegistry {
  private readonly handlers: ReadonlyMap<SyncOperation, SyncOperationHandler>;

  constructor(
    water: WaterAddSyncHandler,
    weight: WeightLogSyncHandler,
    meal: MealCreateSyncHandler,
    workoutStart: WorkoutSessionStartSyncHandler,
    workoutFinish: WorkoutSessionFinishSyncHandler,
    glp1Dose: Glp1DoseCreateSyncHandler,
    glp1Symptom: Glp1SymptomCreateSyncHandler,
    notificationPreferences: NotificationPreferencesSetSyncHandler,
  ) {
    this.handlers = new Map<SyncOperation, SyncOperationHandler>([
      [water.operation, water],
      [weight.operation, weight],
      [meal.operation, meal],
      [workoutStart.operation, workoutStart],
      [workoutFinish.operation, workoutFinish],
      [glp1Dose.operation, glp1Dose],
      [glp1Symptom.operation, glp1Symptom],
      [notificationPreferences.operation, notificationPreferences],
    ]);
  }

  resolve(operation: string): SyncOperationHandler | undefined {
    return this.handlers.get(operation as SyncOperation);
  }
}
