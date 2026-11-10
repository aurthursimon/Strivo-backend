import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BillingModule } from '../billing/billing.module';
import {
  DoseEventsController,
  DosePlanPeriodsController,
  Glp1ConsentController,
  Glp1SetupController,
  InjectionSitesController,
  ReminderRulesController,
  SymptomsController,
  TimelineController,
  TreatmentsController,
} from './glp1.controller';
import { Glp1Service } from './glp1.service';

@Module({
  imports: [JwtModule.register({}), BillingModule],
  controllers: [
    Glp1ConsentController,
    Glp1SetupController,
    TreatmentsController,
    DosePlanPeriodsController,
    DoseEventsController,
    SymptomsController,
    ReminderRulesController,
    InjectionSitesController,
    TimelineController,
  ],
  providers: [Glp1Service],
  exports: [Glp1Service],
})
export class Glp1Module {}
