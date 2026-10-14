import { Db } from '../src/db';
import { Prisma } from '@prisma/client';

// Only the disposable local test database may bypass append-only history for
// fixture teardown. The setting is transaction/connection local, never global.
export async function cleanupFinance(db: Db, schoolId: string) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error('Financial test cleanup requires a disposable local PostgreSQL database');
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.receiptPdfJob.deleteMany({ where: { schoolId } });
    await tx.financeRequest.deleteMany({ where: { schoolId } });
    await tx.cashMovement.deleteMany({ where: { schoolId } });
    await tx.feeCreditAllocationRelease.deleteMany({ where: { schoolId } });
    await tx.feeCreditAllocation.deleteMany({ where: { schoolId } });
    await tx.paymentEvent.deleteMany({ where: { schoolId } });
    await tx.paymentCreditRelease.deleteMany({ where: { schoolId } });
    await tx.paymentAllocationRelease.deleteMany({ where: { schoolId } });
    await tx.paymentCreditApplication.deleteMany({ where: { schoolId } });
    await tx.paymentAllocation.deleteMany({ where: { schoolId } });
    await tx.paymentRefund.deleteMany({ where: { schoolId } });
    await tx.refundCommand.deleteMany({ where: { schoolId } });
    await tx.journalLine.deleteMany({ where: { schoolId } });
    await tx.journalEntry.deleteMany({ where: { schoolId } });
    await tx.financePolicyVersion.deleteMany({ where: { schoolId } });
    await tx.financePolicy.deleteMany({ where: { schoolId } });
    await tx.receiptSeries.deleteMany({ where: { schoolId } });
  });
}

export async function cleanupTestSchool(db: Db, schoolId: string) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error('Test fixture teardown is local-only');
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.loginSession.deleteMany({ where: { user: { schoolId } } });
    for (const model of Prisma.dmmf.datamodel.models.filter(item => item.fields.some(field => field.name === 'schoolId'))) {
      await tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${model.dbName ?? model.name}"`)} WHERE "schoolId"=${schoolId}`);
    }
    await tx.school.delete({ where: { id: schoolId } });
  });
}
