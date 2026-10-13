import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth';
import { Db } from './db';
import { AuthController } from './auth.controller';
import { UsersController } from './users.controller';
import { AcademicController } from './academic.controller';
import { AdmissionsController } from './admissions.controller';
import { StudentsController } from './students.controller';
import { AuditController } from './audit.controller';
import { StudentAccess } from './student-access';
import { DocumentsController, Storage } from './documents.controller';
import { FeeHeadsController, FeePlansController, AssessmentsController, CreditsController, StudentLedgerController } from './fees.controller';
import { ServicesController } from './services.controller';
import { TransportController } from './transport.controller';
import { StoreController } from './store.controller';
import { PaymentsController } from './payments.controller';
import { PaymentService } from './payment.service';

@Module({
  controllers: [AuthController, UsersController, AcademicController, AdmissionsController, StudentsController, AuditController, DocumentsController, FeeHeadsController, FeePlansController, AssessmentsController, CreditsController, StudentLedgerController, ServicesController, TransportController, StoreController, PaymentsController],
  providers: [Db, StudentAccess, Storage, PaymentService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
