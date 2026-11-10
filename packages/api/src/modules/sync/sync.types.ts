import type { Prisma } from '@prisma/client';
import type { SyncMutationDto } from './dto';
import type { SyncOperation, SyncResultStatus } from './sync.constants';

export interface SyncHandlerContext {
  userId: string;
  installationId?: string;
  mutation: SyncMutationDto;
  occurredAt: Date;
  dayOverride?: Date;
}

export interface SyncChangeDraft {
  entityType: string;
  entityId: string;
  action: 'UPSERT' | 'DELETE';
  version?: number;
  data: Record<string, unknown> | null;
}

export interface SyncOperationHandler {
  readonly operation: SyncOperation;
  execute(tx: Prisma.TransactionClient, context: SyncHandlerContext): Promise<SyncChangeDraft>;
}

export interface MealCreateSyncPayload {
  type: 'BREAKFAST' | 'MORNING_SNACK' | 'LUNCH' | 'AFTERNOON_SNACK' | 'DINNER' | 'SUPPER';
  items: Array<{
    id?: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    portion: number;
    unit?: string;
    quantity?: number;
    foodItemId?: string;
  }>;
  imageHash?: string;
  confidence?: number;
  wasEdited?: boolean;
}

export interface WorkoutSessionStartSyncPayload {
  planId: string;
  workoutId: string;
}

export interface WorkoutSessionFinishSyncPayload {
  completedExercises: string[];
  durationMin?: number;
}

export interface Glp1DoseCreateSyncPayload {
  treatmentId: string;
  scheduledAt?: string;
  reminderAt?: string;
  doseMg: number;
  status: 'SCHEDULED' | 'TAKEN' | 'MISSED' | 'SKIPPED' | 'CANCELLED';
  route: 'SUBCUTANEOUS' | 'ORAL';
  injectionSiteCode?: string;
  painLevel?: number;
  notes?: string;
  source?: 'USER' | 'PRESCRIPTION' | 'CLINICIAN' | 'PHARMACIST' | 'OTHER';
  confirmPossibleDuplicate?: boolean;
}

export interface Glp1SymptomCreateSyncPayload {
  treatmentId: string;
  code: string;
  customName?: string;
  severity: number;
  endedAt?: string;
  durationMinutes?: number;
  notes?: string;
  relatedDoseEventIds?: string[];
  acknowledged?: boolean;
  safetyContentVersion?: string;
}

export interface NotificationPreferencesSetSyncPayload {
  pushEnabled: boolean;
  breakfast: string | null;
  lunch: string | null;
  afternoonSnack: string | null;
  dinner: string | null;
  water: boolean;
  waterIntervalH: number;
  waterStartTime: string;
  waterEndTime: string;
  workout: boolean;
  workoutTime: string;
  workoutDays: number[];
  progressCheck: boolean;
  progressCheckTime: string;
  progressCheckWeekday: number;
  streakRisk: boolean;
  streakRiskTime: string;
}

export interface SyncItemError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface SyncItemResult {
  mutationId: string;
  status: SyncResultStatus;
  entityId: string;
  revision?: string;
  result?: Record<string, unknown>;
  error?: SyncItemError;
}

export class SyncOperationRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncOperationRejectedError';
  }
}

export class SyncOperationConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncOperationConflictError';
  }
}
