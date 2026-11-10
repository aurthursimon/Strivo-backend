import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  MedicationConsentController,
  MedicationLogsController,
  MedicationsController,
} from './medications.controller';
import { MedicationsService } from './medications.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MedicationConsentController, MedicationsController, MedicationLogsController],
  providers: [MedicationsService],
  exports: [MedicationsService],
})
export class MedicationsModule {}
