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
import { FinancePolicyController } from './finance-policy';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { StatementService } from './statement.service';
import { RECEIPT_PDF_CONTROLLERS, RECEIPT_PDF_PROVIDERS } from './receipt-pdf';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { PromotionBatchesController, PromotionDecisionsController } from './promotion.controller';
import { PromotionService } from './promotion.service';

@Module({
  controllers: [AuthController, UsersController, AcademicController, AdmissionsController, StudentsController, AuditController, DocumentsController, FeeHeadsController, FeePlansController, AssessmentsController, CreditsController, StudentLedgerController, ServicesController, TransportController, StoreController, PaymentsController, FinancePolicyController, ApprovalController, CashController, ReportsController, AttendanceController, PromotionDecisionsController, PromotionBatchesController, ...RECEIPT_PDF_CONTROLLERS],
  providers: [Db, StudentAccess, Storage, PaymentService, ApprovalService, CashService, ReportsService, StatementService, AttendanceService, PromotionService, ...RECEIPT_PDF_PROVIDERS, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
