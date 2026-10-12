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

@Module({
  controllers: [AuthController, UsersController, AcademicController, AdmissionsController, StudentsController, AuditController, DocumentsController],
  providers: [Db, StudentAccess, Storage, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
