import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

// Opt-in LIVE Next -> API -> PostgreSQL smoke test. Immutable financial history
// is retained under a unique synthetic school; fixture users are disabled and
// sessions removed afterward. Never bypass immutability or reset shared data.
test.describe('Level 4 live collection', () => {
  test.skip(!process.env.E2E_DATABASE_URL, 'Set E2E_DATABASE_URL to the local API database to opt in');
  let db: import('../../backend/node_modules/@prisma/client').PrismaClient;
  let schoolId: string;
  let studentId: string;
  let issueId: string;
  const unique = randomUUID();
  const email = `live-level4-${unique}@example.test`;
  const adminEmail = `live-level4-admin-${unique}@example.test`;
  const password = `Synthetic-${unique}`;
  const admission = `E2E-${unique.slice(0, 8)}`;
  const date = '2026-10-13';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const url = new URL(process.env.E2E_DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Live smoke fixtures require a local disposable database');
    const backend = createRequire(path.resolve(__dirname, '../../backend/package.json'));
    const { PrismaClient } = backend('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    schoolId = (await db.school.create({ data: { name: 'Synthetic live payment school', admissionPrefix: 'LIVE' } })).id;
    const session = await db.academicSession.create({ data: { schoolId, name: '2026–27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), current: true } });
    const classroom = await db.classOffering.create({ data: { schoolId, sessionId: session.id, grade: 'VI', section: 'Live', capacity: 10 } });
    const family = await db.family.create({ data: { schoolId, label: 'Synthetic family' } });
    const student = await db.student.create({ data: { schoolId, familyId: family.id, name: 'Synthetic live student', admissionNumber: admission, dateOfBirth: new Date('2014-01-01'), gender: 'BOY', admissionDate: new Date('2026-04-01') } });
    studentId = student.id;
    const enrollment = await db.enrollment.create({ data: { schoolId, studentId, sessionId: session.id, classId: classroom.id, startDate: new Date('2026-04-01') } });
    const user = await db.user.create({ data: { schoolId, name: 'Synthetic cashier', email, passwordHash: await backend('argon2').hash(password), role: 'ACCOUNTANT', mustChangePassword: false } });
    await db.user.create({ data: { schoolId, name: 'Synthetic Admin', email: adminEmail, passwordHash: await backend('argon2').hash(password), role: 'ADMIN', mustChangePassword: false } });
    const head = await db.feeHead.create({ data: { schoolId, code: 'TUITION', name: 'Live tuition', category: 'MONTHLY' } });
    await db.feeObligation.create({ data: { schoolId, studentId, enrollmentId: enrollment.id, feeHeadId: head.id, periodKey: '2026-04', dueDate: new Date('2026-04-05'), amountMinor: BigInt(100000) } });
    issueId = (await db.storeIssue.create({ data: { schoolId, studentId, enrollmentId: enrollment.id, issueNumber: 'LIVE-STORE-001', issuedAt: new Date('2026-04-01'), totalMinor: BigInt(20000), reason: 'Synthetic issue fixture', createdBy: user.id } })).id;
  });

  test.afterAll(async () => {
    if (!db) return;
    try {
      if (schoolId) {
        const where = { schoolId };
        const users = await db.user.findMany({ where, select: { id: true } });
        await db.loginSession.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
        await db.user.updateMany({ where, data: { active: false } });
        console.info(`Retained immutable synthetic Level 4 history in school ${schoolId}; fixture accounts disabled.`);
      }
    } finally { await db.$disconnect(); }
  });

  test('collects, deposits, requests and approves a refund, then reconciles live reports and shift', async ({ page }) => {
    test.setTimeout(120_000);
    // No financial API mocking. Only remove an unrelated external font fetch.
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const policyStatus = await page.evaluate(async () => (await fetch('/api/v1/finance/policy', { credentials: 'include' })).status);
    expect(policyStatus, 'Live API must have the new Level 4 contracts deployed').toBe(200);

    await page.goto('/cashier');
    await page.getByLabel('Business date', { exact: true }).fill(date);
    await page.getByLabel('Opening float ₹').fill('100');
    await page.getByRole('button', { name: 'Open shift', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cashier shift opened' })).toBeVisible();

    await page.goto('/fees/collect');
    await page.getByLabel('Student search').fill(admission);
    await page.getByRole('button', { name: 'Find student' }).click();
    await page.getByRole('button', { name: new RegExp(admission) }).click();
    await page.getByLabel('Amount received / to post ₹').fill('600');
    await page.getByRole('button', { name: 'Create quote & review' }).click();
    await expect(page.getByRole('row', { name: /Store issue LIVE-STORE-001/ })).toContainText('₹200.00');
    await page.getByLabel('Business date', { exact: true }).fill(date);
    await page.getByLabel('Payer name', { exact: true }).fill('Synthetic guardian');
    await page.getByLabel('Cash tendered ₹').fill('1000');
    await expect(page.locator('.cash-change')).toContainText('₹400.00');
    await page.getByRole('button', { name: 'Post payment', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Payment posted', exact: true })).toBeVisible();

    const payment = await db.payment.findFirstOrThrow({ where: { schoolId, studentId } });
    expect(payment.receivedAmountMinor).toBe(BigInt(60000));
    expect(await db.payment.count({ where: { schoolId } })).toBe(1);
    const issue = await db.storeIssue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.status).toBe('PAID'); expect(issue.paidMinor).toBe(BigInt(20000));
    const obligation = await db.feeObligation.findFirstOrThrow({ where: { schoolId, studentId } });
    expect(obligation.amountMinor - obligation.paidMinor).toBe(BigInt(60000));

    await page.getByRole('link', { name: /View immutable receipt/ }).click();
    const receipt = page.getByRole('region', { name: 'Immutable receipt' });
    await expect(receipt).toContainText('Synthetic live student');
    await expect(receipt).toContainText('₹600.00');
    await expect(page.getByRole('button', { name: 'Refund payment', exact: true })).toHaveCount(0);
    await db.student.update({ where: { id: studentId }, data: { name: 'Synthetic renamed student' } });
    await page.reload();
    await expect(receipt).toContainText('Synthetic live student');
    await expect(receipt).not.toContainText('Synthetic renamed student');
    await page.evaluate(() => { window.print = () => {}; });
    await page.getByLabel('Reprint reason').fill('Synthetic copy check');
    await page.getByRole('button', { name: 'Print / reprint' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Reprint event recorded' })).toBeVisible();
    expect(await db.receiptEvent.count({ where: { schoolId, type: 'REPRINT' } })).toBe(1);

    await page.goto('/cashier');
    await expect(page.getByRole('region', { name: 'Selected shift' })).toContainText('₹700.00');
    await page.getByLabel('Movement type').selectOption('DEPOSIT');
    await page.getByLabel('Movement amount ₹').fill('100');
    await page.getByLabel('Movement reference').fill('SYNTHETIC-DEPOSIT');
    await page.getByLabel('Movement reason').fill('Synthetic deposit only');
    await page.getByRole('button', { name: 'Record cash movement' }).click();
    await expect(page.getByRole('status')).toContainText('DEPOSIT recorded');
    await expect(page.getByRole('region', { name: 'Selected shift' })).toContainText('₹600.00');

    const issued = await db.receipt.findFirstOrThrow({ where: { schoolId } });
    const openShift = await db.cashierShift.findFirstOrThrow({ where: { schoolId } });
    await page.goto(`/receipts?receiptId=${issued.id}`);
    await page.getByRole('button', { name: 'Request correction', exact: true }).click();
    await page.getByLabel('Requested refund ₹').fill('50');
    await page.getByLabel('Requested payout shift').selectOption(openShift.id);
    await page.getByLabel('Request reason', { exact: true }).fill('Synthetic correction request');
    await page.getByLabel('Request reference', { exact: true }).fill('SYNTHETIC-REFUND');
    await page.getByRole('button', { name: 'Submit correction request' }).click();
    await expect(page.getByRole('region', { name: 'Correction request' })).toContainText('REQUESTED');
    expect(await db.paymentRefund.count({ where: { schoolId } })).toBe(0);
    await page.getByRole('button', { name: /Sign out/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/login');
    await page.getByLabel('Email address').fill(adminEmail); await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click(); await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/finance/requests');
    await page.getByRole('button', { name: 'Review request' }).click();
    await page.getByLabel('Decision reason').fill('Synthetic Admin approval');
    await page.getByRole('button', { name: 'Submit decision' }).click();
    await expect(page.getByRole('status')).toContainText('Server decision: APPLIED');
    expect(await db.paymentRefund.count({ where: { schoolId } })).toBe(1);
    const refund = await db.paymentRefund.findFirstOrThrow({ where: { schoolId } }); expect(refund.amountMinor).toBe(BigInt(5000));
    await page.goto(`/receipts?receiptId=${issued.id}`);
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('PARTIALLY REFUNDED');
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('Synthetic live student');

    await page.goto('/reports');
    await page.getByLabel('From business date').fill(date); await page.getByLabel('To business date').fill(date);
    await page.getByRole('button', { name: 'Apply report filters' }).click();
    await expect(page.getByLabel('Full filtered totals')).toContainText('₹550.00');
    await page.getByRole('button', { name: 'Journal', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Journal · full filtered totals' })).toBeVisible();
    await expect(page.getByLabel('Full filtered totals')).toContainText('BalancedYes');
    await page.goto(`/statements?studentId=${studentId}`);
    await expect(page.getByRole('heading', { name: /Student statement/ })).toBeVisible();
    await expect(page.getByText('Synthetic renamed student', { exact: false }).first()).toBeVisible();

    await page.goto('/cashier');
    await page.getByRole('button', { name: 'View shift' }).click();
    await expect(page.getByRole('region', { name: 'Selected shift' })).toContainText('₹550.00');
    await page.getByLabel('Counted cash ₹').fill('550');
    await page.getByRole('button', { name: 'Close shift', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cashier shift closed' })).toBeVisible();
    const shift = await db.cashierShift.findFirstOrThrow({ where: { schoolId } });
    expect(shift.status).toBe('CLOSED'); expect(shift.expectedCashMinor).toBe(BigInt(55000)); expect(shift.varianceMinor).toBe(BigInt(0));
    expect(browserErrors).toEqual([]);
  });
});
