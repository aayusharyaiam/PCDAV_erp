import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Actor, AdminOnly, CurrentUser, Roles } from './auth';
import { audit, Db, Tx } from './db';
import { jsonSafe, minor } from './fee-utils';
import { FinancePolicyDto } from './finance.dto';

export async function policyFor(tx: Tx, schoolId: string) {
  // A read must not issue a financial write. Absence has the same versioned
  // demo defaults as a persisted policy; the first Admin edit stores both versions.
  return await tx.financePolicy.findUnique({ where: { schoolId } }) ?? {
    schoolId, version: 1, receiptPrefix: 'DEMO/FEE', receiptScope: 'SCHOOL',
    allowAdvance: true, blockPreviousSession: false, bounceFeeMinor: 0n,
  };
}

@Controller('finance/policy')
export class FinancePolicyController {
  constructor(private readonly db: Db) {}
  @Get() @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async get(@CurrentUser() actor: Actor) { return jsonSafe(await policyFor(this.db, actor.schoolId)); }

  @Post() @AdminOnly()
  async save(@CurrentUser() actor: Actor, @Body() body: FinancePolicyDto) {
    const bounceFeeMinor = minor(body.bounceFeeMinor, true);
    return this.db.atomic(async tx => {
      const before = await policyFor(tx, actor.schoolId);
      if (before.version !== body.version) throw new ConflictException('Financial demo policy version is stale; reload');
      await tx.financePolicyVersion.upsert({ where: { schoolId_version: { schoolId: actor.schoolId, version: before.version } }, update: {}, create: { schoolId: actor.schoolId, version: before.version, snapshot: jsonSafe(before) as unknown as Prisma.InputJsonValue, reason: 'Configurable DEMO defaults; not real school policy', createdBy: actor.id } });
      const data = { version: body.version + 1, receiptPrefix: body.receiptPrefix, receiptScope: body.receiptScope, allowAdvance: body.allowAdvance, blockPreviousSession: body.blockPreviousSession, bounceFeeMinor };
      const policy = await tx.financePolicy.upsert({ where: { schoolId: actor.schoolId }, create: { schoolId: actor.schoolId, ...data }, update: data });
      await tx.financePolicyVersion.create({ data: { schoolId: actor.schoolId, version: policy.version, snapshot: jsonSafe(policy) as unknown as Prisma.InputJsonValue, reason: body.reason, createdBy: actor.id } });
      await audit(tx, actor, 'DEMO_FINANCE_POLICY_CHANGED', 'FinancePolicy', actor.schoolId, body.reason, before, policy);
      return jsonSafe(policy);
    });
  }
}
