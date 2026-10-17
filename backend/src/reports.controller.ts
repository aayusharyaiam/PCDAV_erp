import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor, CurrentUser, Roles } from './auth';
import { ReportQueryDto } from './dto';
import { DuesReportDto, JournalReportDto } from './finance.dto';
import { ReportsService } from './reports.service';
import { StatementService } from './statement.service';

@Controller()
@Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly statements: StatementService) {}
  @Get('reports/dues')
  dues(@CurrentUser() actor: Actor, @Query() query: DuesReportDto) { return this.reports.dues(actor, query); }
  @Get('reports/journal')
  journal(@CurrentUser() actor: Actor, @Query() query: JournalReportDto) { return this.reports.journal(actor, query); }
  @Get('students/:id/statement')
  statement(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.statements.get(actor, id); }

  @Get('reports/admissions')
  admissions(@CurrentUser() actor: Actor, @Query() query: ReportQueryDto) { return this.reports.admissions(actor, query); }

  @Get('reports/admission')
  admission(@CurrentUser() actor: Actor, @Query() query: ReportQueryDto) { return this.reports.admissions(actor, query); }

  @Get('reports/enrollments')
  enrollments(@CurrentUser() actor: Actor, @Query() query: ReportQueryDto) { return this.reports.enrollments(actor, query); }

  @Get('reports/enrollment')
  enrollment(@CurrentUser() actor: Actor, @Query() query: ReportQueryDto) { return this.reports.enrollments(actor, query); }

  @Get('reports/transport')
  transport(@CurrentUser() actor: Actor, @Query() query: ReportQueryDto) { return this.reports.transport(actor, query); }

  @Get('reports/store')
  store(@CurrentUser() actor: Actor, @Query() query: ReportQueryDto) { return this.reports.store(actor, query); }

  @Get('reports/operational')
  operational(@CurrentUser() actor: Actor, @Query() query: ReportQueryDto) {
    if (query.area?.toUpperCase() === 'STORE') return this.reports.store(actor, query);
    return this.reports.transport(actor, query);
  }
}
