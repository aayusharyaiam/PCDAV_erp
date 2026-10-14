import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor, CurrentUser, Roles } from './auth';
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
}
