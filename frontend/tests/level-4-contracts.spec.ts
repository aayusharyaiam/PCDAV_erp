import { expect, test as base, Page, Request } from '@playwright/test';
import * as f from './fixtures/level-4-contracts';

type Reply = { body: unknown; status?: number; abort?: boolean; pdf?: string };
type Call = { path: string; url: URL; method: string; body: unknown; request: Request };
type MockApi = { calls: Call[]; install: (handler: (call: Call) => Reply | undefined, role?: string) => Promise<void> };

// These exercise the real Next/React UI, with ALL API traffic mocked. They are
// frontend contract regressions, not proof of live database/backend integration.
const test = base.extend<{ mockApi: MockApi }>({
  mockApi: async ({ page }, use) => {
    // External font CSS can block hydration on an offline test host. It is not
    // part of the financial contract; keep every application/API request real or
    // explicitly accounted for below.
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    const calls: Call[] = [];
    const unexpected: string[] = [];
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await use({ calls, install: async (handler, role = 'ACCOUNTANT') => {
      await page.route('**/api/v1/**', async route => {
        const request = route.request(); const url = new URL(request.url());
        const call = { path: url.pathname.replace('/api/v1', ''), url, method: request.method(), body: request.postData() ? request.postDataJSON() : undefined, request };
        calls.push(call);
        const response = call.path === '/auth/me' ? { body: { user: { id: 'cashier-1', schoolId: 'school-1', name: 'Test Staff', email: 'staff@example.test', role, active: true, version: 1, mustChangePassword: false }, csrfToken: 'mock-csrf' } } : handler(call) ?? (
          call.path === '/finance/requests' && call.url.searchParams.get('limit') === '1' ? { body: { items: [], total: 0, page: 1, limit: 1 } }
            : /\/pdf\/status$/.test(call.path) ? { body: f.pdfStatus }
              : call.method === 'GET' && /\/cashier-shifts\/[^/]+\/movements$/.test(call.path) ? { body: { items: [] } } : undefined);
        if (!response) unexpected.push(`${call.method} ${call.path}${url.search}`);
        if (response?.abort) { await route.abort('failed'); return; }
        if (response?.pdf) { await route.fulfill({ status: 200, contentType: 'application/pdf', body: response.pdf }); return; }
        await route.fulfill({ status: response?.status ?? (response ? 200 : 501), json: response?.body ?? { message: 'Unexpected mocked API request' } });
      });
    } });
    expect(unexpected, 'Every API call must match a backend contract fixture').toEqual([]);
    expect(browserErrors, 'No runtime errors rendering backend response shapes').toEqual([]);
  },
});

test.describe('Level 4 completion — MOCKED API', () => {
  test('reports use full filtered BigInt totals, page server rows, and expose journal and statement lineage', async ({ page, mockApi }) => {
    await mockApi.install(call => {
      if (call.path === '/reports/collections') return { body: f.collections };
      if (call.path === '/reports/dues') {
        const current = Number(call.url.searchParams.get('page'));
        if (call.url.searchParams.has('studentId')) {
          expect(call.url.searchParams.get('studentId')).toBe('student-1'); expect(call.url.searchParams.get('sessionId')).toBe('session-1');
          expect(call.url.searchParams.get('classId')).toBe('class-1'); expect(call.url.searchParams.get('feeHeadId')).toBe('head-1'); expect(call.url.searchParams.get('asOf')).toBe(f.date);
        }
        return { body: { items: [{ ...f.due, sourceId: current === 1 ? 'fee-1' : 'fee-2' }], total: 26, page: current, limit: 25, totals: { assessedMinor: '900719925474099312', outstandingMinor: '650000', overdueMinor: '650000' }, asOf: f.date, agingDate: f.date, basis: 'CURRENT_BALANCES_WITH_DUE_DATE_CUTOFF_NOT_HISTORICAL' } };
      }
      if (call.path === '/reports/journal') return { body: f.journal };
      if (call.path === '/students/student-1/statement') return { body: f.statement };
      return registerReads(call);
    });
    await page.goto('/reports'); await page.getByRole('button', { name: 'Dues', exact: true }).click();
    await page.getByLabel('Student ID', { exact: true }).fill('student-1'); await page.getByLabel('Session ID').fill('session-1');
    await page.getByLabel('Class ID').fill('class-1'); await page.getByLabel('Fee head ID').fill('head-1'); await page.getByLabel('Aging cutoff (as of)').fill(f.date);
    await page.getByRole('button', { name: 'Apply report filters' }).click();
    await expect(page.getByLabel('Full filtered totals')).toContainText(`₹${BigInt('9007199254740993').toLocaleString('en-IN')}.12`);
    await expect(page.getByLabel('Full filtered totals')).toContainText('₹6,500.00');
    await expect(page.getByText(/not a historical ledger reconstruction/)).toBeVisible();
    await page.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(page.getByText('26 matching rows · Page 2')).toBeVisible();
    await expect(page.getByRole('row', { name: /fee-2/ })).toBeVisible(); await expect(page.getByLabel('Full filtered totals')).toContainText('₹6,500.00');
    await page.getByRole('button', { name: 'Journal', exact: true }).click(); await page.getByText(/Synthetic captured funds/).click();
    await expect(page.getByRole('row', { name: /CASH/ })).toContainText('₹150.00');
    await page.getByRole('link', { name: 'student-1', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Journal reconciliation' })).toBeVisible();
    await expect(page.getByText('Reconciled', { exact: true })).toBeVisible();
    await page.getByLabel('Source / lineage filter').fill('traced-release-1');
    await expect(page.getByText('Synthetic traced advance release', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('₹5.00', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Source / lineage filter').fill('payment-1');
    await page.getByRole('link', { name: 'Open immutable receipt', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('Student at issue');
  });

  test('collection drilldown filters correction event date rather than payment received date', async ({ page, mockApi }) => {
    await mockApi.install(call => {
      if (call.path === '/reports/collections') return { body: f.collections };
      if (call.path === '/payments') { expect(call.url.searchParams.has('fromDate')).toBe(false); expect(call.url.searchParams.has('toDate')).toBe(false); return { body: f.pageOf([f.payment]) }; }
      if (call.path === '/payments/payment-1') return { body: { ...f.paymentResult, events: [...f.paymentResult.events, { ...f.paymentResult.events[0], id: 'refund-event-1', type: 'REFUND_POSTED', businessDate: '2026-10-15', amountMinor: '2000', reason: 'Later date correction' }] } };
    });
    await page.goto('/reports'); await page.getByLabel('From business date').fill('2026-10-15'); await page.getByLabel('To business date').fill('2026-10-15');
    await page.getByLabel('Payment mode').selectOption('CASH'); await page.getByLabel('Original cashier ID').fill('cashier-1');
    await page.getByRole('button', { name: 'Apply report filters' }).click(); await page.getByRole('button', { name: 'Drill down collection events' }).click();
    await expect(page.getByText('REFUND_POSTED · ₹20.00')).toBeVisible(); await expect(page.getByText(/PAYMENT_CAPTURED ·/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Receipt snapshot' })).toBeVisible();
  });

  test('Accountant request survives an ambiguous response and reload; Admin applies only the server decision', async ({ page, mockApi }) => {
    let posts = 0;
    let request = { ...f.correctionRequest };
    const handler = (call: Call): Reply | undefined => {
      if (call.path === '/finance/requests' && call.method === 'POST') {
        expect(call.body).toEqual({ paymentId: 'payment-1', type: 'REFUND', amountMinor: '2000', reason: 'Synthetic refund request', reference: 'REQ-001', businessDate: f.date, shiftId: 'shift-1' });
        expect(call.request.headers()['x-csrf-token']).toBe('mock-csrf');
        return ++posts === 1 ? { status: 503, body: { message: 'Request response lost' } } : { body: request };
      }
      if (call.path === '/finance/requests') return { body: { items: [request], total: 1, page: 1, limit: 25 } };
      if (call.path === '/finance/requests/request-1/approve') {
        expect(call.body).toEqual({ reason: 'Synthetic Admin approval' });
        request = { ...request, status: 'APPLIED', decidedBy: 'admin-1', decidedAt: f.timestamp, decisionReason: 'Synthetic Admin approval' };
        return { body: request };
      }
      if (call.path === '/cashier-shifts') return { body: f.pageOf([f.shift]) };
      return registerReads(call);
    };
    await mockApi.install(handler);
    await inspectReceipt(page);
    await page.getByRole('button', { name: 'Request correction', exact: true }).click();
    await page.getByLabel('Requested refund ₹').fill('20');
    await page.getByLabel('Requested payout shift').selectOption('shift-1');
    await page.getByLabel('Request reference', { exact: true }).fill('REQ-001');
    await page.getByLabel('Request reason', { exact: true }).fill('Synthetic refund request');
    await page.getByRole('button', { name: 'Submit correction request' }).click();
    await expect(page.getByText('Unconfirmed request — frozen for safe retry')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Retry correction request' }).click();
    await expect(page.getByRole('region', { name: 'Correction request' })).toContainText('REQUESTED');
    const writes = mockApi.calls.filter(c => c.path === '/finance/requests' && c.method === 'POST');
    expect(writes).toHaveLength(2); expect(writes[1].request.postData()).toBe(writes[0].request.postData());
    expect(writes[1].request.headers()['idempotency-key']).toBe(writes[0].request.headers()['idempotency-key']);
    expect(mockApi.calls.some(c => c.method === 'POST' && c.path.startsWith('/payments/'))).toBe(false);
    await mockApi.install(handler, 'ADMIN');
    await page.goto('/finance/requests');
    await page.getByRole('button', { name: 'Review request' }).click();
    await page.getByLabel('Decision reason').fill('Synthetic Admin approval');
    await page.getByRole('button', { name: 'Submit decision' }).click();
    await expect(page.getByRole('status')).toContainText('Server decision: APPLIED');
  });

  for (const status of ['STALE', 'REJECTED']) {
    test(`Admin inbox shows authoritative ${status} without claiming application`, async ({ page, mockApi }) => {
      let current = { ...f.correctionRequest };
      await mockApi.install(call => {
        if (call.path === '/finance/requests') return { body: f.pageOf([current]) };
        if (call.path.startsWith('/finance/requests/request-1/')) { current = { ...current, status, decisionReason: status === 'STALE' ? 'Financial state changed' : 'Rejected with reason' }; return { body: current }; }
      }, 'ADMIN');
      await page.goto('/finance/requests'); await page.getByRole('button', { name: 'Review request' }).click();
      if (status === 'REJECTED') await page.getByLabel('Decision', { exact: true }).selectOption('reject');
      await page.getByLabel('Decision reason').fill('Synthetic decision'); await page.getByRole('button', { name: 'Submit decision' }).click();
      await expect(page.getByRole('status')).toContainText(`Server decision: ${status}`);
      await expect(page.getByRole('status')).not.toContainText('APPLIED');
      if (status === 'STALE') await expect(page.getByText(/Create a fresh request from the receipt/)).toBeVisible();
    });
  }

  test('cash movement freezes amount/reference/key across reload and refreshes server cash', async ({ page, mockApi }) => {
    let writes = 0;
    await mockApi.install(call => {
      if (call.path === '/cashier-shifts') return { body: f.pageOf([{ ...f.shift, expectedCashMinor: writes ? '14000' : '16000', cashMovedMinor: writes ? '2000' : '0' }]) };
      if (call.path === '/cashier-shifts/shift-1/movements' && call.method === 'POST') {
        expect(call.body).toEqual({ type: 'DEPOSIT', amountMinor: '2000', reference: 'DEP-001', reason: 'Synthetic bank deposit' });
        expect(call.request.headers()['x-csrf-token']).toBe('mock-csrf');
        return ++writes === 1 ? { status: 503, body: { message: 'Lost movement response' } } : { body: f.movement };
      }
      if (call.path.endsWith('/movements')) return { body: { items: writes ? [f.movement] : [] } };
    });
    await page.goto('/cashier'); await page.getByLabel('Movement amount ₹').fill('20');
    await expect(page.getByLabel('Movement type').locator('option[value="EXPENSE"]')).toHaveCount(0);
    await page.getByLabel('Movement reference').fill('DEP-001'); await page.getByLabel('Movement reason').fill('Synthetic bank deposit');
    await page.getByRole('button', { name: 'Record cash movement' }).click();
    await expect(page.getByRole('button', { name: 'Close shift', exact: true })).toBeDisabled();
    await page.reload(); await expect(page.getByText('Unconfirmed movement — frozen for safe retry')).toBeVisible();
    await page.getByRole('button', { name: 'Retry cash movement' }).click();
    await expect(page.getByRole('region', { name: 'Selected shift' })).toContainText('₹140.00');
    const calls = mockApi.calls.filter(c => c.path.endsWith('/movements') && c.method === 'POST');
    expect(calls).toHaveLength(2); expect(calls[1].request.postData()).toBe(calls[0].request.postData()); expect(calls[1].request.headers()['idempotency-key']).toBe(calls[0].request.headers()['idempotency-key']);
  });

  test('Admin expense requires a reference and reason', async ({ page, mockApi }) => {
    await mockApi.install(call => {
      if (call.path === '/cashier-shifts') return { body: f.pageOf([f.shift]) };
      if (call.path.endsWith('/movements') && call.method === 'POST') { expect(call.body).toEqual({ type: 'EXPENSE', amountMinor: '500', reason: 'Synthetic stationery expense', reference: 'EXP-001' }); return { body: { ...f.movement, type: 'EXPENSE', amountMinor: '500', reference: 'EXP-001' } }; }
    }, 'ADMIN');
    await page.goto('/cashier'); await page.getByLabel('Movement type').selectOption('EXPENSE'); await page.getByLabel('Movement amount ₹').fill('5');
    await page.getByRole('button', { name: 'Record cash movement' }).click();
    expect(mockApi.calls.filter(c => c.method === 'POST')).toHaveLength(0);
    await page.getByLabel('Movement reason').fill('Synthetic stationery expense'); await page.getByLabel('Movement reference').fill('EXP-001');
    await page.getByRole('button', { name: 'Record cash movement' }).click(); await expect(page.getByRole('status')).toContainText('EXPENSE recorded');
  });

  test('quote selection sends explicit arrays; changing selection invalidates preview', async ({ page, mockApi }) => {
    let posts = 0;
    await mockApi.install(call => {
      if (call.path === '/payment-quotes') {
        expect(call.body).toEqual({ studentId: 'student-1', amountMinor: '15000', obligationIds: ['fee-1'], storeIssueIds: [] });
        const q = f.quote(); const totals = { paymentAllocatedMinor: '11000', projectedCreditMinor: '4000', projectedOutstandingMinor: '3000' };
        return { body: { ...q, ...totals, allocations: [f.allocations[1]], allocationPlan: { ...q.allocationPlan, ...totals, newCreditMinor: '4000', lines: [f.allocations[1]], selection: { obligationIds: ['fee-1'], storeIssueIds: [] } } } };
      }
      if (call.path === '/payments' && call.method === 'POST') return ++posts === 1 ? { status: 503, body: { message: 'Selected payment response lost' } } : { body: f.paymentResult };
      return collectionReads(call);
    });
    await page.goto('/fees/collect?studentId=student-1');
    await page.getByLabel('Select specific fee obligations and store issues').check();
    await page.getByRole('checkbox', { name: /SI-001/ }).uncheck();
    await page.getByLabel('Amount received / to post ₹').fill('150'); await page.getByRole('button', { name: 'Create quote & review' }).click();
     await expect(page.getByRole('heading', { name: '3. Review payment' })).toBeVisible();
    await page.getByRole('checkbox', { name: /SI-001/ }).check(); await expect(page.getByRole('heading', { name: '3. Review quote' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: /SI-001/ }).uncheck(); await page.getByRole('button', { name: 'Create quote & review' }).click();
    await payer(page); await page.getByRole('button', { name: 'Post payment', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry payment' })).toBeVisible(); await page.reload();
    await expect(page.getByLabel('Select specific fee obligations and store issues')).toBeChecked();
    await expect(page.getByLabel('Select specific fee obligations and store issues')).toBeDisabled();
    await expect(page.getByText(/Quoted fee IDs: fee-1 · Quoted store IDs: None/)).toBeVisible();
     await page.getByRole('button', { name: 'Retry payment' }).click(); await expect(page.getByRole('heading', { name: 'Receipt ready', exact: true })).toBeVisible();
    const writes = mockApi.calls.filter(c => c.path === '/payments' && c.method === 'POST'); expect(writes[1].request.postData()).toBe(writes[0].request.postData()); expect(writes[1].request.headers()['idempotency-key']).toBe(writes[0].request.headers()['idempotency-key']);
  });

  test('demo policy preserves version concurrency and exact minor-unit values', async ({ page, mockApi }) => {
    let saves = 0;
    await mockApi.install(call => {
      if (call.path === '/finance/policy' && call.method === 'GET') return { body: { ...f.policy, version: saves ? 2 : 1 } };
      if (call.path === '/finance/policy') { expect(call.body).toEqual({ version: 1, receiptPrefix: 'DEMO/TEST', receiptScope: 'FINANCIAL_YEAR', allowAdvance: false, blockPreviousSession: true, bounceFeeMinor: '125', reason: 'Synthetic policy test' }); saves++; return { status: 409, body: { message: 'Policy version changed' } }; }
    }, 'ADMIN');
    await page.goto('/finance/policy'); await expect(page.getByText('DEMO · Synthetic data only', { exact: true })).toBeVisible();
    await page.getByLabel('Receipt prefix').fill('DEMO/TEST'); await page.getByLabel('Receipt sequence scope').selectOption('FINANCIAL_YEAR');
    await page.getByLabel('Allow advance credit').uncheck(); await page.getByLabel('Block new-session allocations while previous-session dues remain').check();
    await page.getByLabel('Demo bounce fee ₹').fill('1.25'); await page.getByLabel('Policy change reason').fill('Synthetic policy test');
    await page.getByRole('button', { name: 'Save demo policy' }).click(); await expect(page.locator('.notice[role="alert"]')).toContainText('Policy version changed');
    await page.getByRole('button', { name: 'Reload server policy' }).click(); await expect(page.getByText(/Version 2 ·/)).toBeVisible();
  });

  test('PDF is never ready on enqueue; failed download disables it; retry uses CSRF and reason', async ({ page, mockApi }) => {
    let status = { ...f.pdfStatus, status: 'FAILED', attempts: 1, errorCode: 'RENDER_FAILED' as string | null };
    let downloads = 0;
    await mockApi.install(call => {
      if (call.path.endsWith('/pdf/status')) return { body: status };
      if (call.path.endsWith('/pdf/retry')) { expect(call.body).toEqual({ reason: 'Synthetic PDF retry' }); expect(call.request.headers()['x-csrf-token']).toBe('mock-csrf'); status = { ...status, status: 'PENDING', errorCode: null }; return { body: status }; }
      if (call.path.endsWith('/pdf')) return ++downloads === 1 ? { status: 503, body: { message: 'Receipt status changed; PDF pending' } } : { pdf: '%PDF-1.4\nSynthetic contract PDF\n%%EOF', body: null };
      return registerReads(call);
    });
    await inspectReceipt(page); await expect(page.getByRole('button', { name: 'Download receipt PDF' })).toBeDisabled();
    await page.getByLabel('PDF retry reason').fill('Synthetic PDF retry'); await page.getByRole('button', { name: 'Retry PDF generation' }).click();
    await expect(page.getByText('PENDING · 1 attempts')).toBeVisible(); await expect(page.getByRole('button', { name: 'Download receipt PDF' })).toBeDisabled();
    status = { ...status, status: 'READY', downloadAvailable: true };
    await page.getByRole('button', { name: 'Refresh PDF status' }).click(); await page.getByRole('button', { name: 'Download receipt PDF' }).click();
    await expect(page.locator('.notice[role="alert"]')).toContainText('Receipt status changed'); await expect(page.getByRole('button', { name: 'Download receipt PDF' })).toBeDisabled();
    await page.getByRole('button', { name: 'Refresh PDF status' }).click();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download receipt PDF' }).click(); expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  });
});

function collectionReads(call: Call): Reply | undefined {
  if (call.method !== 'GET') return;
  if (call.path === '/students') return { body: f.pageOf([f.student]) };
  if (call.path === '/students/student-1') return { body: { student: f.student, enrollments: [], guardians: [], family: null, siblings: [], documents: [], timeline: [], applications: [] } };
  if (call.path === '/students/student-1/ledger') return { body: f.ledger };
  if (call.path === '/store/issues') {
    expect(call.url.searchParams.get('status')).toBe('OPEN'); expect(call.url.searchParams.get('q')).toBe('PDAV-0001');
    return { body: f.pageOf([f.storeIssue]) };
  }
}
async function reviewQuote(page: Page) {
  await page.goto('/fees/collect?studentId=student-1');
  await page.getByLabel('Amount received / to post ₹').fill('150.00');
  await page.getByRole('button', { name: 'Create quote & review' }).click();
  await expect(page.getByRole('heading', { name: '3. Review payment' })).toBeVisible();
}
async function payer(page: Page) {
  await page.getByLabel('Business date', { exact: true }).fill(f.date);
  await page.getByLabel('Payer name', { exact: true }).fill('Original Guardian');
  await page.getByLabel('Payer phone (optional)').fill('9222222222');
}
function expectedBase(mode: string) { return { quoteId: 'quote-1', quoteVersion: 3, receivedAmountMinor: '15000', currency: 'INR', businessDate: f.date, mode, payerName: 'Original Guardian', payerPhone: '9222222222' }; }
function registerReads(call: Call, detail = f.detail): Reply | undefined {
  if (call.method !== 'GET') return;
  if (call.path === '/receipts') return { body: f.pageOf([detail.receipt]) };
  if (call.path === '/payments') { expect(call.url.searchParams.get('status')).toBe('PENDING_CHEQUE'); return { body: f.pageOf([f.pendingCheque]) }; }
  if (call.path === '/receipts/receipt-1') return { body: detail };
}
async function inspectReceipt(page: Page) {
  await page.goto('/receipts');
  await page.getByRole('button', { name: 'Metadata / reprint' }).first().click();
  await expect(page.getByRole('region', { name: 'Immutable receipt' })).toBeVisible();
}

test.describe('Level 4 frontend contracts — MOCKED API', () => {
  test('cash quote uses backend allocation fields; ambiguous retry survives reload with identical bytes and key', async ({ page, mockApi }) => {
    let posts = 0;
    await mockApi.install(call => {
      if (call.path === '/payment-quotes') { expect(call.body).toEqual({ studentId: 'student-1', amountMinor: '15000' }); return { body: f.quote() }; }
      if (call.path === '/payments' && call.method === 'POST') {
        expect(call.body).toEqual({ ...expectedBase('CASH'), tenderedAmountMinor: '16000' });
        expect(call.request.headers()['x-csrf-token']).toBe('mock-csrf');
        if (++posts === 1) return { status: 503, body: { message: 'Response lost after commit', requestId: 'request-1' } };
        if (posts === 2) return { status: 403, body: { message: 'CSRF rejected before command lookup' } };
        return { body: f.paymentResult };
      }
      if (call.path === '/receipts/receipt-1') return { body: f.detail };
      if (call.path === '/receipts') return { body: f.pageOf([f.receipt]) };
      if (call.path === '/payments') return { body: f.pageOf([]) };
      return collectionReads(call);
    });
    await reviewQuote(page);
    await expect(page.getByRole('row', { name: /Store issue SI-001/ })).toContainText('₹30.00');
    await expect(page.getByRole('row', { name: /Tuition · 2026-04/ })).toContainText('₹110.00');
    await expect(page.getByText('Quote quote-1 · version 3')).toBeVisible();
    await payer(page); await page.getByLabel('Cash tendered ₹').fill('160');
    await expect(page.locator('.cash-change')).toContainText('₹10.00');
    await page.getByRole('button', { name: 'Post payment', exact: true }).click();
    await expect(page.locator('.notice[role="alert"]')).toContainText('Request request-1');
    await expect(page.getByRole('button', { name: 'Find student' })).toBeDisabled();
    await expect(page.getByLabel('Payer name', { exact: true })).toBeDisabled();
    await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find(key => key.startsWith('pcdav_pending_payment_attempt:'))!;
      const stored = JSON.parse(sessionStorage.getItem(key)!);
      stored.quote.expiresAt = '2020-01-01T00:00:00.000Z';
      sessionStorage.setItem(key, JSON.stringify(stored));
    });
    // The URL student must not overwrite the restored frozen attempt.
    await page.goto('/fees/collect?studentId=some-other-student');
    await expect(page.getByLabel('Cash tendered ₹')).toHaveValue('160.00');
    await expect(page.getByLabel('Amount received / to post ₹')).toBeDisabled();
    await expect(page.getByText('Expired — fresh payments need a new quote')).toBeVisible();
    await page.getByRole('button', { name: 'Retry payment' }).click();
    await expect(page.locator('.notice[role="alert"]')).toContainText('CSRF rejected');
    await expect(page.getByRole('button', { name: 'Find student' })).toBeDisabled();
    await expect(page.getByLabel('Amount received / to post ₹')).toBeDisabled();
    await page.getByRole('button', { name: 'Retry payment' }).click();
     await expect(page.getByRole('heading', { name: 'Receipt ready', exact: true })).toBeVisible();
    const writes = mockApi.calls.filter(call => call.path === '/payments' && call.method === 'POST');
    expect(writes).toHaveLength(3);
    expect(writes[1].request.postData()).toBe(writes[0].request.postData());
    expect(writes[1].request.headers()['idempotency-key']).toBe(writes[0].request.headers()['idempotency-key']);
    expect(writes[2].request.postData()).toBe(writes[0].request.postData());
    expect(writes[2].request.headers()['idempotency-key']).toBe(writes[0].request.headers()['idempotency-key']);
    expect(writes[0].request.headers()['idempotency-key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('pcdav_pending_payment_attempt:')))).toEqual([]);
     await page.getByRole('link', { name: /View receipt/ }).click();
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('Student at issue');
  });

  test('corrupted recovery storage blocks a fresh collection', async ({ page, mockApi }) => {
    await mockApi.install(() => undefined);
    await page.addInitScript(() => sessionStorage.setItem('pcdav_pending_payment_attempt:school-1:cashier-1', '{broken'));
    await page.goto('/fees/collect?studentId=student-1');
    await expect(page.locator('.notice[role="alert"]')).toContainText('Unable to restore the saved payment');
    await expect(page.getByRole('button', { name: 'Find student' })).toBeDisabled();
    expect(mockApi.calls.filter(call => !['/auth/me', '/finance/requests'].includes(call.path))).toEqual([]);
  });

  for (const method of ['UPI', 'BANK_TRANSFER'] as const) {
    test(`manual ${method} payment records the counter reference`, async ({ page, mockApi }) => {
      await mockApi.install(call => {
        if (call.path === '/payment-quotes') { expect(call.body).toEqual({ studentId: 'student-1', amountMinor: '15000' }); return { body: f.quote() }; }
        if (call.path === '/payments') {
          expect(call.body).toEqual({ ...expectedBase(method), reference: 'TXN-001' });
          return { body: { ...f.paymentResult, payment: { ...f.payment, mode: method, reference: 'TXN-001' }, receipt: { ...f.receipt, snapshot: { ...f.snapshot, payment: { ...f.snapshot.payment, mode: method, reference: 'TXN-001' } } } } };
        }
        return collectionReads(call);
      });
      await reviewQuote(page); await payer(page);
      await page.getByRole('radio', { name: method === 'UPI' ? 'UPI' : 'Bank transfer', exact: true }).check();
      await page.getByLabel(method === 'UPI' ? 'UPI reference' : 'Bank transfer reference').fill('TXN-001');
      await page.getByRole('button', { name: 'Post payment', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Receipt ready', exact: true })).toBeVisible();
    });
  }

  test('manual UPI payment keeps the exact counter command across an ambiguous retry', async ({ page, mockApi }) => {
    let posts = 0;
    await mockApi.install(call => {
      if (call.path === '/payment-quotes') return { body: f.quote() };
      if (call.path === '/payments') {
        expect(call.body).toEqual({ ...expectedBase('UPI'), reference: 'TXN-001' });
        return ++posts === 1 ? { status: 503, body: { message: 'Unconfirmed counter capture' } } : { body: { ...f.paymentResult, payment: { ...f.payment, mode: 'UPI', reference: 'TXN-001' }, receipt: f.receipt } };
      }
      return collectionReads(call);
    });
    await reviewQuote(page); await payer(page);
    await page.getByRole('radio', { name: 'UPI', exact: true }).check();
    await page.getByLabel('UPI reference').fill('TXN-001');
    await page.getByRole('button', { name: 'Post payment', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry payment' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('UPI reference')).toHaveValue('TXN-001');
    await expect(page.getByLabel('UPI reference')).toBeDisabled();
    await page.getByRole('button', { name: 'Retry payment' }).click();
    await expect(page.getByRole('heading', { name: 'Receipt ready', exact: true })).toBeVisible();
    const writes = mockApi.calls.filter(call => call.path === '/payments' && call.method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[1].request.postData()).toBe(writes[0].request.postData());
    expect(writes[1].request.headers()['idempotency-key']).toBe(writes[0].request.headers()['idempotency-key']);
  });

  test('cheque posts number/bank/date and issues a counter receipt', async ({ page, mockApi }) => {
    await mockApi.install(call => {
      if (call.path === '/payment-quotes') return { body: f.quote() };
      if (call.path === '/payments') {
        expect(call.body).toEqual({ ...expectedBase('CHEQUE'), chequeNumber: '123456', chequeBank: 'Test Bank', chequeDate: '2026-10-12' });
        return { body: { ...f.paymentResult, payment: { ...f.payment, mode: 'CHEQUE', chequeNumber: '123456', chequeBank: 'Test Bank', chequeDate: '2026-10-12T00:00:00.000Z' }, receipt: { ...f.receipt, snapshot: { ...f.snapshot, payment: { ...f.snapshot.payment, mode: 'CHEQUE', chequeNumber: '123456', chequeBank: 'Test Bank', chequeDate: '2026-10-12' } } } } };
      }
      return collectionReads(call);
    });
    await reviewQuote(page); await payer(page);
    await page.getByRole('radio', { name: 'Cheque', exact: true }).check();
    await page.getByLabel('Cheque number').fill('123456'); await page.getByLabel('Cheque bank').fill('Test Bank'); await page.getByLabel('Cheque date').fill('2026-10-12');
    await page.getByRole('button', { name: 'Post payment', exact: true }).click();
     await expect(page.getByRole('heading', { name: 'Receipt ready', exact: true })).toBeVisible();
     await expect(page.getByRole('link', { name: /View receipt/ })).toBeVisible();
  });

  test('no-dues advance is quotable and stale-quote rejection releases the frozen command', async ({ page, mockApi }) => {
    let quotes = 0;
    await mockApi.install(call => {
      if (call.path === '/students/student-1/ledger') return { body: { ...f.ledger, items: [], credits: [], totals: { assessedMinor: '0', outstandingMinor: '0', availableCreditMinor: '0' } } };
      if (call.path === '/store/issues') return { body: f.pageOf([]) };
      if (call.path === '/payment-quotes') { quotes++; expect(call.body).toEqual({ studentId: 'student-1', amountMinor: '15000' }); return { body: f.quote({ allocations: [], availableCreditMinor: '0', creditAppliedMinor: '0', paymentAllocatedMinor: '0', projectedCreditMinor: '15000', creditApplications: [], allocationPlan: { amountMinor: '15000', availableCreditMinor: '0', creditAppliedMinor: '0', paymentAllocatedMinor: '0', projectedOutstandingMinor: '0', projectedCreditMinor: '15000', newCreditMinor: '15000', lines: [], creditApplications: [] } }) }; }
      if (call.path === '/payments') return { status: 409, body: { message: 'Payment quote is stale; request a fresh allocation preview' } };
      return collectionReads(call);
    });
    await reviewQuote(page);
    await expect(page.getByText('No outstanding dues. This payment will become student credit.')).toBeVisible();
    await payer(page); await page.getByRole('button', { name: 'Post payment', exact: true }).click();
    await expect(page.locator('.notice[role="alert"]')).toContainText('Payment quote is stale');
    await expect(page.getByRole('button', { name: 'Retry payment' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Create quote & review' }).click();
     await expect(page.getByRole('heading', { name: '3. Review payment' })).toBeVisible(); expect(quotes).toBe(2);
  });

  test('receipt snapshot renders school, payer, cash and allocations; reprint reason is recorded before printing', async ({ page, mockApi }) => {
    let prints = 0;
    await page.exposeFunction('testPrint', () => { prints++; });
    await page.addInitScript(() => { window.print = () => { void (window as unknown as { testPrint: () => Promise<void> }).testPrint(); }; });
    let attempts = 0;
    await mockApi.install(call => {
      if (call.path === '/receipts/receipt-1/print-events') {
        expect(call.body).toEqual({ reason: 'Guardian requested another copy' });
        expect(prints).toBe(0);
        if (++attempts === 1) return { status: 503, body: { message: 'Reprint audit unavailable' } };
        return { body: { receipt: f.receipt, printEvent: { ...f.issuedEvent, id: 'print-1', type: 'REPRINT', metadata: { reason: 'Guardian requested another copy' } }, reprint: f.reprint } };
      }
      return registerReads(call);
    });
    await inspectReceipt(page);
    const saved = page.getByRole('region', { name: 'Immutable receipt' });
    for (const text of ['School at issue', 'Original school address', 'Student at issue', 'Original Guardian', 'Collector at issue', 'V A', 'Cash tendered ₹160.00', 'Change ₹10.00', 'Store issue SI-001', 'Tuition · 2026-04']) await expect(saved).toContainText(text);
    await expect(saved).not.toContainText('Current Student');
    await expect(page.getByRole('button', { name: 'Reverse payment', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refund payment', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Bounce/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Print / reprint' }).click();
    expect(attempts).toBe(0);
    await page.getByLabel('Reprint reason').fill('Guardian requested another copy');
    await page.getByRole('button', { name: 'Print / reprint' }).click();
    await expect(page.locator('.notice[role="alert"]')).toContainText('Reprint audit unavailable'); expect(prints).toBe(0);
    await page.getByRole('button', { name: 'Print / reprint' }).click();
    await expect.poll(() => prints).toBe(1);
    await expect(page.getByText(/Reprint events: 1/)).toBeVisible();
    await expect(saved).toContainText('Student at issue');
    expect(mockApi.calls.filter(call => call.path === '/payments' && call.method === 'POST')).toHaveLength(0);
  });

  test('Accountant clears pending cheque using an explicit business date and reason', async ({ page, mockApi }) => {
    let cleared = false;
    const clearedPayment = { ...f.pendingCheque, status: 'CLEARED', captureBusinessDate: '2026-10-16T00:00:00.000Z', captureShiftId: 'shift-clear', capturedAt: f.timestamp };
    const clearedReceipt = { ...f.receipt, paymentId: clearedPayment.id, snapshot: { ...f.snapshot, payment: { ...f.snapshot.payment, id: clearedPayment.id, mode: 'CHEQUE', tenderedAmountMinor: null, changeMinor: '0', chequeNumber: '123456', chequeBank: 'Test Bank', chequeDate: '2026-10-12', captureBusinessDate: '2026-10-16' } } };
    await mockApi.install(call => {
      if (call.path === '/payments/cheque-1/clear-cheque') { expect(call.body).toEqual({ businessDate: '2026-10-16', reason: 'Bank confirmation received' }); cleared = true; return { body: { ...f.paymentResult, payment: clearedPayment, receipt: clearedReceipt } }; }
      if (call.path === '/payments') { expect(call.url.searchParams.get('status')).toBe('PENDING_CHEQUE'); return { body: f.pageOf(cleared ? [] : [f.pendingCheque]) }; }
      if (call.path === '/receipts') return { body: f.pageOf(cleared ? [clearedReceipt] : []) };
      if (call.path === '/receipts/receipt-1') return { body: { ...f.detail, payment: clearedPayment, receipt: clearedReceipt } };
    });
    await page.goto('/receipts'); await page.getByRole('button', { name: 'Clear cheque', exact: true }).click();
    await page.getByLabel('Clearance business date').fill('2026-10-16'); await page.getByLabel('Action reason').fill('Bank confirmation received');
    await page.getByRole('button', { name: 'Confirm clear cheque' }).click();
    await expect(page.getByText('No pending cheques', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('2026-10-13 / 2026-10-16');
    await expect(page.getByRole('button', { name: /Bounce/ })).toHaveCount(0);
    await page.getByLabel('Receipt capture business date').fill('2026-10-16');
    await expect(page.getByRole('button', { name: 'Metadata / reprint' })).toHaveCount(1);
  });

  for (const cleared of [false, true]) {
    test(`Admin can bounce a ${cleared ? 'cleared' : 'pending'} cheque with correction date and reason`, async ({ page, mockApi }) => {
      let bounced = false;
      const cheque = { ...f.pendingCheque, status: cleared ? 'CLEARED' : 'PENDING_CHEQUE', captureBusinessDate: cleared ? f.payment.captureBusinessDate : null, capturedAt: cleared ? f.timestamp : null, captureShiftId: cleared ? 'shift-1' : null };
      const chequeReceipt = { ...f.receipt, paymentId: cheque.id, snapshot: { ...f.snapshot, payment: { ...f.snapshot.payment, id: cheque.id, mode: 'CHEQUE', tenderedAmountMinor: null, changeMinor: '0', chequeNumber: cheque.chequeNumber, chequeBank: cheque.chequeBank, chequeDate: '2026-10-12' } } };
      await mockApi.install(call => {
        if (call.path === '/payments/cheque-1/bounce') { expect(call.body).toEqual({ businessDate: '2026-10-17', reason: 'Cheque returned unpaid' }); bounced = true; return { body: { ...f.paymentResult, payment: { ...cheque, status: 'BOUNCED' }, receipt: cleared ? { ...chequeReceipt, status: 'VOID' } : null } }; }
        if (call.path === '/payments') return { body: f.pageOf(!cleared && !bounced ? [cheque] : []) };
        if (call.path === '/receipts') return { body: f.pageOf(cleared ? [{ ...chequeReceipt, status: bounced ? 'VOID' : 'ISSUED' }] : []) };
        if (call.path === '/receipts/receipt-1') return { body: { ...f.detail, receipt: { ...chequeReceipt, status: bounced ? 'VOID' : 'ISSUED' }, payment: { ...cheque, status: bounced ? 'BOUNCED' : cheque.status } } };
      }, 'ADMIN');
      if (cleared) await inspectReceipt(page); else await page.goto('/receipts');
      await page.getByRole('button', { name: cleared ? 'Bounce cleared cheque' : 'Bounce', exact: true }).click();
      await page.getByLabel('Correction business date').fill('2026-10-17'); await page.getByLabel('Action reason').fill('Cheque returned unpaid');
      await page.getByRole('button', { name: 'Confirm bounce cheque' }).click();
      await expect(page.getByRole('status')).toContainText('BOUNCED');
      if (cleared) { await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('VOID'); await expect(page.getByRole('button', { name: 'Bounce cleared cheque' })).toHaveCount(0); }
      else await expect(page.getByText('No pending cheques', { exact: true })).toBeVisible();
    });
  }

  test('Admin partial refund and reversal use open payout shift and retain original snapshot', async ({ page, mockApi }) => {
    const refund = { id: 'refund-1', schoolId: 'school-1', paymentId: f.payment.id, shiftId: 'payout-1', businessDate: '2026-10-15', amountMinor: '3000', reason: 'Earlier refund', reference: '', createdBy: 'admin-1', createdAt: f.timestamp };
    let refunds = [refund]; let status = 'PARTIALLY_REFUNDED'; let receiptStatus = 'PARTIALLY_REFUNDED';
    const currentDetail = () => ({ ...f.detail, receipt: { ...f.receipt, status: receiptStatus }, payment: { ...f.payment, status }, refunds });
    await mockApi.install(call => {
      if (call.path === '/cashier-shifts') { expect(call.url.searchParams.get('status')).toBe('OPEN'); return { body: f.pageOf([{ ...f.shift, id: 'payout-1', businessDate: '2026-10-15T00:00:00.000Z' }]) }; }
      if (call.path === '/payments/payment-1/refunds') { expect(call.request.headers()['idempotency-key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/); expect(call.body).toEqual({ businessDate: '2026-10-15', shiftId: 'payout-1', reason: 'Return excess collection', amountMinor: '2000', reference: 'REF-001' }); refunds = [...refunds, { ...refund, id: 'refund-2', amountMinor: '2000' }]; return { body: { ...f.paymentResult, ...currentDetail() } }; }
      if (call.path === '/payments/payment-1/reverse') { expect(call.body).toEqual({ businessDate: '2026-10-15', shiftId: 'payout-1', reason: 'Duplicate collection reversed' }); status = 'REVERSED'; receiptStatus = 'VOID'; refunds = [...refunds, { ...refund, id: 'refund-3', amountMinor: '10000' }]; return { body: { ...f.paymentResult, ...currentDetail() } }; }
      if (call.path === '/receipts/receipt-1') return { body: currentDetail() };
      if (call.path === '/receipts') return { body: f.pageOf([currentDetail().receipt]) };
      if (call.path === '/payments') return { body: f.pageOf([]) };
    }, 'ADMIN');
    await inspectReceipt(page);
    await page.getByRole('button', { name: 'Refund payment', exact: true }).click();
    await expect(page.getByLabel('Open payout shift')).toHaveValue('payout-1');
    await expect(page.getByLabel('Refund amount ₹')).toHaveValue('120.00');
    await page.getByLabel('Refund amount ₹').fill('130'); await page.getByLabel('Action reason').fill('Return excess collection');
    await page.getByRole('button', { name: 'Confirm refund payment' }).click();
    await expect(page.locator('.notice[role="alert"]')).toContainText('cannot exceed the unrefunded amount');
    expect(mockApi.calls.filter(call => call.path.endsWith('/refunds'))).toHaveLength(0);
    await page.getByLabel('Refund amount ₹').fill('20'); await page.getByLabel('Refund reference (optional)').fill('REF-001');
    await page.getByRole('button', { name: 'Confirm refund payment' }).click();
    await expect(page.getByText(/Unrefunded amount: ₹100.00/)).toBeVisible();
    await page.getByRole('button', { name: 'Reverse payment', exact: true }).click();
    await page.getByLabel('Action reason').fill('Duplicate collection reversed');
    await page.getByRole('button', { name: 'Confirm reverse payment' }).click();
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('VOID');
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('₹150.00');
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('Student at issue');
    await expect(page.getByRole('button', { name: 'Reverse payment', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refund payment', exact: true })).toHaveCount(0);
  });

  test('Superadmin electronic refund sends reference/date without a payout shift', async ({ page, mockApi }) => {
    let refunded = false;
    await mockApi.install(call => {
      const current = () => ({ ...f.detail, payment: { ...f.electronicPayment, status: refunded ? 'REFUNDED' : 'CAPTURED' }, receipt: { ...f.electronicReceipt, status: refunded ? 'REFUNDED' : 'ISSUED' }, refunds: refunded ? [{ id: 'refund-electronic', schoolId: 'school-1', paymentId: f.payment.id, shiftId: null, businessDate: '2026-10-15T00:00:00.000Z', amountMinor: '15000', reason: 'Electronic payment returned', reference: 'REF-BANK', createdBy: 'cashier-1', createdAt: f.timestamp }] : [] });
      if (call.path === '/payments/payment-1/refunds') { expect(call.request.headers()['idempotency-key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/); expect(call.body).toEqual({ reason: 'Electronic payment returned', businessDate: '2026-10-15', amountMinor: '15000', reference: 'REF-BANK' }); refunded = true; return { body: { ...f.paymentResult, ...current() } }; }
      if (call.path === '/receipts/receipt-1') return { body: current() };
      if (call.path === '/receipts') return { body: f.pageOf([current().receipt]) };
      if (call.path === '/payments') return { body: f.pageOf([]) };
    }, 'SUPERADMIN');
    await inspectReceipt(page); await page.getByRole('button', { name: 'Refund payment', exact: true }).click();
    await expect(page.getByLabel('Open payout shift')).toHaveCount(0);
    await page.getByLabel('Correction business date').fill('2026-10-15'); await page.getByLabel('Action reason').fill('Electronic payment returned'); await page.getByLabel('Refund reference (optional)').fill('REF-BANK');
    await page.getByRole('button', { name: 'Confirm refund payment' }).click();
    await expect(page.getByRole('region', { name: 'Immutable receipt' })).toContainText('REFUNDED');
  });

  for (const electronic of [false, true]) {
    test(`ambiguous ${electronic ? 'electronic network' : 'cash server'} refund freezes key/payload across reload and blocks fresh corrections`, async ({ page, mockApi }) => {
      let posts = 0;
      const payment = electronic ? f.electronicPayment : f.payment;
      const receipt = electronic ? f.electronicReceipt : f.receipt;
      const refund = { id: 'refund-1', schoolId: 'school-1', paymentId: payment.id, shiftId: electronic ? null : 'payout-1', businessDate: '2026-10-15', amountMinor: '2000', reason: 'Return small excess', reference: 'REF-001', createdBy: 'cashier-1', createdAt: f.timestamp };
      const current = () => ({ ...f.detail, payment: { ...payment, status: posts ? 'PARTIALLY_REFUNDED' : 'CAPTURED' }, receipt: { ...receipt, status: posts ? 'PARTIALLY_REFUNDED' : 'ISSUED' }, refunds: posts ? [refund] : [] });
      await mockApi.install(call => {
        if (call.path === '/cashier-shifts') return { body: f.pageOf(posts ? [] : [{ ...f.shift, id: 'payout-1', businessDate: '2026-10-15T00:00:00.000Z' }]) };
        if (call.path === '/payments/payment-1/refunds') {
          expect(call.body).toEqual({ reason: 'Return small excess', businessDate: '2026-10-15', ...(electronic ? {} : { shiftId: 'payout-1' }), amountMinor: '2000', reference: 'REF-001' });
          expect(call.request.headers()['x-csrf-token']).toBe('mock-csrf');
          if (++posts === 1) return { status: 503, abort: electronic, body: { message: 'Refund committed but response lost' } };
          if (posts === 2) return { status: 403, body: { message: 'CSRF check rejected retry before command lookup' } };
          return { body: { ...f.paymentResult, ...current() } };
        }
        if (call.path === '/receipts/receipt-1') return { body: current() };
        if (call.path === '/receipts') return { body: f.pageOf([current().receipt]) };
        if (call.path === '/payments') return { body: f.pageOf([f.pendingCheque]) };
      }, 'ADMIN');
      await inspectReceipt(page);
      await page.getByRole('button', { name: 'Refund payment', exact: true }).click();
      if (electronic) await page.getByLabel('Correction business date').fill('2026-10-15');
      await page.getByLabel('Refund amount ₹').fill('20');
      await page.getByLabel('Refund reference (optional)').fill('REF-001');
      await page.getByLabel('Action reason').fill('Return small excess');
      await page.getByRole('button', { name: 'Confirm refund payment' }).click();
      await expect(page.getByRole('status')).toContainText('Refund outcome is unconfirmed');
      for (const label of ['Refund amount ₹', 'Refund reference (optional)', 'Action reason', 'Correction business date']) await expect(page.getByLabel(label)).toBeDisabled();
      for (const name of ['Refund payment', 'Reverse payment', 'Cancel action', 'Bounce', 'Clear cheque', 'Close receipt']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
      // Restore the original target even when a different receipt is in the URL.
      await page.goto('/receipts?receiptId=some-other-receipt');
      await expect(page.getByLabel('Refund amount ₹')).toHaveValue('20.00');
      await expect(page.getByLabel('Refund amount ₹')).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Cancel action' })).toBeDisabled();
      if (!electronic) { await expect(page.getByLabel('Open payout shift')).toHaveValue('payout-1'); await expect(page.getByLabel('Open payout shift')).toBeDisabled(); }
      await expect(page.getByText(/Unrefunded amount: ₹130.00/)).toBeVisible();
      await page.getByRole('button', { name: 'Retry refund' }).click();
      await expect(page.locator('.notice[role="alert"]')).toContainText('CSRF check rejected retry');
      await expect(page.getByRole('button', { name: 'Refund payment', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Cancel action' })).toBeDisabled();
      await expect(page.getByLabel('Refund amount ₹')).toBeDisabled();
      await page.getByRole('button', { name: 'Retry refund' }).click();
      await expect(page.getByRole('status')).toContainText('Refund payment recorded');
      const writes = mockApi.calls.filter(call => call.path.endsWith('/refunds'));
      expect(writes).toHaveLength(3);
      expect(writes[0].request.headers()['idempotency-key']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
      expect(writes[1].request.headers()['idempotency-key']).toBe(writes[0].request.headers()['idempotency-key']);
      expect(writes[1].request.postData()).toBe(writes[0].request.postData());
      expect(writes[2].request.headers()['idempotency-key']).toBe(writes[0].request.headers()['idempotency-key']);
      expect(writes[2].request.postData()).toBe(writes[0].request.postData());
      expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('pcdav_pending_refund_attempt:')))).toEqual([]);
      await expect(page.getByRole('button', { name: 'Refund payment', exact: true })).toBeEnabled();
      expect(mockApi.calls.filter(call => /\/reverse$|\/bounce$|\/clear-cheque$/.test(call.path))).toHaveLength(0);
    });
  }

  for (const mismatch of [false, true]) {
    test(`refund ${mismatch ? 'idempotency mismatch preserves' : 'definitive rejection releases'} frozen command`, async ({ page, mockApi }) => {
      await mockApi.install(call => {
        if (call.path === '/payments/payment-1/refunds') return { status: 409, body: { message: mismatch ? 'Idempotency-Key was already used with a different refund request' : 'Payment credit has already been used' } };
        if (call.path === '/receipts/receipt-1') return { body: { ...f.detail, payment: f.electronicPayment, receipt: f.electronicReceipt } };
        if (call.path === '/receipts') return { body: f.pageOf([f.electronicReceipt]) };
        if (call.path === '/payments') return { body: f.pageOf([]) };
      }, 'ADMIN');
      await inspectReceipt(page); await page.getByRole('button', { name: 'Refund payment', exact: true }).click();
      await page.getByLabel('Correction business date').fill('2026-10-15');
      await page.getByLabel('Action reason').fill('Return payment');
      await page.getByRole('button', { name: 'Confirm refund payment' }).click();
      await expect(page.locator('.notice[role="alert"]')).toContainText(mismatch ? 'Idempotency-Key' : 'Payment credit');
      await expect(page.getByRole('button', { name: 'Retry refund' })).toHaveCount(mismatch ? 1 : 0);
      if (mismatch) await expect(page.getByRole('button', { name: 'Reverse payment', exact: true })).toBeDisabled();
      else {
        await page.getByRole('button', { name: 'Refund payment', exact: true }).click();
        await page.getByLabel('Refund amount ₹').fill('1'); await page.getByLabel('Action reason').fill('Smaller available refund');
        await page.getByRole('button', { name: 'Confirm refund payment' }).click();
        await expect(page.locator('.notice[role="alert"]')).toContainText('Payment credit');
        const writes = mockApi.calls.filter(call => call.path.endsWith('/refunds'));
        expect(writes).toHaveLength(2);
        expect(writes[1].request.headers()['idempotency-key']).not.toBe(writes[0].request.headers()['idempotency-key']);
        expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('pcdav_pending_refund_attempt:')))).toEqual([]);
      }
    });
  }

  test('cashier opens own shift despite another cashier open; uses exact close fields and server expected cash', async ({ page, mockApi }) => {
    const other = { ...f.shift, id: 'other-shift', cashierId: 'other-cashier' };
    let own: typeof f.shift | null = null;
    await mockApi.install(call => {
      if (call.path === '/cashier-shifts' && call.method === 'GET') return { body: f.pageOf(own ? [other, own] : [other]) };
      if (call.path === '/cashier-shifts' && call.method === 'POST') { expect(call.body).toEqual({ businessDate: f.date, openingFloatMinor: '1000' }); own = { ...f.shift }; return { body: { ...own, expectedCashMinor: null } }; }
      if (call.path === '/cashier-shifts/shift-1/close') { expect(call.body).toEqual({ countedCashMinor: '15900', reason: 'Count short by one rupee' }); own = { ...f.shift, status: 'CLOSED', countedCashMinor: '15900', varianceMinor: '-100', closedAt: f.timestamp, closeReason: 'Count short by one rupee' }; return { body: own }; }
    });
    await page.goto('/cashier'); await page.getByLabel('Business date', { exact: true }).fill(f.date);
    await page.getByRole('button', { name: 'View shift' }).click();
    await expect(page.getByRole('button', { name: 'Close shift', exact: true })).toHaveCount(0);
    await page.getByLabel('Opening float ₹').fill('10'); await page.getByRole('button', { name: 'Open shift', exact: true }).click();
    const selected = page.getByRole('region', { name: 'Selected shift' });
    await expect(selected).toContainText('Shift shift-1 · Cashier cashier-1');
    await expect(selected.locator('.money-summary').filter({ hasText: 'Expected cash' })).toContainText('₹160.00');
    await expect(page.getByText('Cash received', { exact: true })).toBeVisible();
    await page.getByLabel('Counted cash ₹').fill('159'); await page.getByRole('button', { name: 'Close shift', exact: true }).click();
    await expect(page.locator('.notice[role="alert"]')).toContainText('Enter a variance reason');
    expect(mockApi.calls.filter(call => call.path.endsWith('/close'))).toHaveLength(0);
    await page.getByLabel('Variance reason (required when counted differs)').fill('Count short by one rupee');
    await page.getByRole('button', { name: 'Close shift', exact: true }).click();
    await expect(selected).toContainText('CLOSED'); await expect(selected).toContainText('-₹1.00');
    await expect(selected).toContainText('Count short by one rupee');
    await expect(page.getByRole('button', { name: 'Open shift', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Close shift', exact: true })).toHaveCount(0);
  });

  test('Admin can close another cashier shift with zero variance and an empty reason', async ({ page, mockApi }) => {
    let current = { ...f.shift, cashierId: 'other-cashier' };
    await mockApi.install(call => {
      if (call.path === '/cashier-shifts') return { body: f.pageOf([current]) };
      if (call.path === '/cashier-shifts/shift-1/close') { expect(call.body).toEqual({ countedCashMinor: '16000', reason: '' }); current = { ...current, status: 'CLOSED', countedCashMinor: '16000', varianceMinor: '0', closedAt: f.timestamp }; return { body: current }; }
    }, 'ADMIN');
    await page.goto('/cashier'); await page.getByRole('button', { name: 'View shift' }).click();
    await page.getByLabel('Counted cash ₹').fill('160'); await page.getByRole('button', { name: 'Close shift', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Selected shift' })).toContainText('CLOSED');
  });

  test('register follows list pagination and filters valid receipt statuses', async ({ page, mockApi }) => {
    await mockApi.install(call => {
      if (call.path === '/payments') return { body: f.pageOf([]) };
      if (call.path === '/receipts') {
        const pageNumber = Number(call.url.searchParams.get('page'));
        return { body: pageNumber === 1 ? f.pageOf(Array.from({ length: 100 }, (_, index) => ({ ...f.receipt, id: `receipt-${index}`, receiptNumber: `R-${index}` })), 1, 101) : f.pageOf([{ ...f.receipt, id: 'last-receipt', receiptNumber: 'LAST-101', status: 'PARTIALLY_REFUNDED' }], 2, 101) };
      }
    });
    await page.goto('/receipts'); await expect(page.getByText('101 of 101 receipts')).toBeVisible();
    await page.getByLabel('Receipt status').selectOption('PARTIALLY_REFUNDED');
    await expect(page.getByRole('button', { name: 'Metadata / reprint' })).toHaveCount(1);
    await expect(page.getByRole('row', { name: /LAST-101/ })).toBeVisible();
  });

  test('Teacher cannot open any Level 4 workspace or trigger financial API reads', async ({ page, mockApi }) => {
    await mockApi.install(() => undefined, 'TEACHER');
    for (const path of ['/fees/collect', '/receipts', '/cashier', '/finance/requests', '/finance/policy', '/reports', '/statements']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    }
    expect(mockApi.calls.every(call => call.path === '/auth/me')).toBe(true);
  });
});
