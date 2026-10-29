import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Prisma, Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { Actor, AuthGuard, publicUser, tokenHash } from '../src/auth';
import { Db } from '../src/db';
import { ApiErrors } from '../src/errors';
import { ReceiptPdfController } from '../src/receipt-pdf.controller';
import { ReceiptPdfRenderer, receiptPdfAmount } from '../src/receipt-pdf.renderer';
import { ReceiptPdfService } from '../src/receipt-pdf.service';
import { RECEIPT_PDF_BATCH_SIZE, RECEIPT_PDF_POLL_MS, ReceiptPdfWorker } from '../src/receipt-pdf.worker';

function original(status = 'ISSUED', count = 1, ids = { schoolId: 'school-original', studentId: 'student-original', paymentId: 'payment-original' }) {
  const issuedAt = new Date('2026-10-13T10:11:12.000Z');
  const receiptNumber = `DEMO/FEE/2026/${randomUUID()}`;
  const snapshot = {
    receiptNumber, currency: 'INR', templateVersion: 'receipt-v1',
    school: { id: ids.schoolId, name: 'Original School', address: 'Original address', phone: '01123456789', email: 'school@example.test' },
    student: { id: ids.studentId, name: 'Original Student', admissionNumber: 'ADMIT-001' },
    enrollment: { id: 'enrollment-original', sessionId: 'session-original', classId: 'class-original', className: 'XI A · Science' },
    payer: { name: 'Original Guardian', phone: '9222222222' },
    payment: {
      id: ids.paymentId, businessDate: '2026-10-13', captureBusinessDate: '2026-10-13', issuedAt: issuedAt.toISOString(),
      mode: 'CASH', channel: '', reference: 'Original reference', chequeNumber: '', chequeBank: '', chequeDate: null,
      receivedAmountMinor: '9007199254740993', tenderedAmountMinor: '9007199254741000' as string | null, changeMinor: '7',
    },
    allocation: {
      lines: Array.from({ length: count }, (_, i) => ({ targetType: i % 2 ? 'STORE' : 'FEE', targetId: `source-${i}`,
        reference: `REFERENCE-${i}`, description: `Original allocation ${i}`, dueDate: '2026-10-01', beforeOutstandingMinor: '20001',
        creditAppliedMinor: '100', paymentAllocatedMinor: '19801', afterOutstandingMinor: '100' })),
      creditAppliedMinor: '100', paymentAllocatedMinor: '19801', projectedOutstandingMinor: '100', projectedCreditMinor: '0',
    },
    collector: { id: 'collector-original', name: 'Original Collector' },
  };
  return { id: randomUUID(), ...ids, receiptNumber, status, issuedAt, templateVersion: 'receipt-v1', snapshot };
}

// Extract actual PDFKit page text operators from Flate streams, rather than
// checking the renderer's input or PDF metadata. No browser or parser binary.
function pdfPages(bytes: Buffer): string[] {
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.subarray(-7).toString()).toContain('%%EOF');
  const pages: string[] = [];
  for (const match of bytes.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const stream = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    if (!stream.includes('BT')) continue;
    const text = [...stream.matchAll(/\[([^\]]*)\]\s*TJ/g)].map(operator =>
      [...operator[1].matchAll(/<([0-9a-f]+)>/gi)].map(hex => new TextDecoder('windows-1252').decode(Buffer.from(hex[1], 'hex'))).join(''),
    ).join('\n');
    pages.push(text);
  }
  expect(pages.length).toBe((bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length);
  return pages;
}

describe('Receipt PDF renderer', () => {
  const renderer = new ReceiptPdfRenderer();

  it('renders a real multipage PDF with immutable originals, exact paise and repeated identifiers/table headings', async () => {
    const receipt = original('PARTIALLY_REFUNDED', 110);
    const before = JSON.stringify(receipt);
    const pages = pdfPages(await renderer.render(receipt));
    const text = pages.join('\n');
    expect(pages.length).toBeGreaterThan(5);
    for (const value of ['Original School', 'Original address', 'Original Student', 'ADMIT-001', 'Original Guardian', 'Original reference', 'Original Collector', 'XI A · Science', '90071992547409.93', '90071992547410.00', 'Change returned: INR 0.07', '2026-10-13T10:11:12.000Z']) expect(text).toContain(value);
    for (let i = 0; i < 110; i++) expect(text).toContain(`Original allocation ${i}\n`);
    expect(text).toContain('REFERENCE-109');
    expect(text).toContain('source-109');
    for (let i = 0; i < pages.length; i++) {
      expect(pages[i]).toContain('PARTIALLY REFUNDED');
      expect(pages[i]).toContain(receipt.id);
      expect(pages[i]).toContain(receipt.paymentId);
      expect(pages[i]).toContain(receipt.schoolId);
      expect(pages[i]).toContain(`Page ${i + 1} / ${pages.length}`);
      if (pages[i].includes('Original allocation')) expect(pages[i]).toContain('Allocation / source');
    }
    expect(text).toContain('not the current net paid amount');
    expect(JSON.stringify(receipt)).toBe(before);
  });

  it.each(['ISSUED', 'VOID', 'REFUNDED'])('marks %s clearly while preserving original received amount', async status => {
    const text = pdfPages(await renderer.render(original(status))).join('\n');
    expect(text).toContain(status);
    expect(text).toContain('Original received: INR 90071992547409.93');
    if (status === 'VOID') expect(text).toContain('NOT A VALID PAYMENT RECEIPT');
  });

  it('supports Devanagari names and rejects unsupported Unicode rather than silently corrupting student/payer names', async () => {
    const receipt = original();
    receipt.snapshot.student.name = 'आरव शर्मा';
    const devanagariPdf = await renderer.render(receipt);
    expect(devanagariPdf.subarray(0, 5).toString()).toBe('%PDF-');
    receipt.snapshot.student.name = 'Jose\u0301';
    await expect(renderer.render(receipt)).rejects.toMatchObject({ code: 'UNSUPPORTED_TEXT' });
    receipt.snapshot.student.name = 'Emoji 🎓';
    await expect(renderer.render(receipt)).rejects.toMatchObject({ code: 'UNSUPPORTED_TEXT' });
    receipt.snapshot.student.name = 'José';
    expect(pdfPages(await renderer.render(receipt)).join('\n')).toContain('José');
  });

  it('fails closed on mismatched immutable identity, malformed monetary values and oversized allocations', async () => {
    const receipt = original();
    await expect(renderer.render({ ...receipt, studentId: 'changed-student' })).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    await expect(renderer.render({ ...receipt, status: 'UNKNOWN' })).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    receipt.snapshot.payment.receivedAmountMinor = '1.01';
    await expect(renderer.render(receipt)).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    await expect(renderer.render(original('ISSUED', 2001))).rejects.toMatchObject({ code: 'PDF_LIMIT_EXCEEDED' });
    expect(receiptPdfAmount('1')).toBe('0.01');
    expect(receiptPdfAmount('0')).toBe('0.00');
    expect(() => receiptPdfAmount(9007199254740993)).toThrow();
  });
});

describe('Receipt PDF worker lifecycle', () => {
  it('starts within the API, survives a database outage and stops polling on shutdown', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const query = jest.fn().mockRejectedValueOnce(new Error('Database temporarily unavailable')).mockResolvedValue([]);
    const worker = new ReceiptPdfWorker({ $queryRaw: query } as unknown as Db, new ReceiptPdfRenderer());
    try {
      worker.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(0);
      expect(query).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(RECEIPT_PDF_POLL_MS);
      expect(query).toHaveBeenCalledTimes(2);
      await worker.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(RECEIPT_PDF_POLL_MS * 2);
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      await worker.onModuleDestroy();
      warn.mockRestore();
      jest.useRealTimers();
    }
  });
});

// Uses a random schema, applies the real migrations, and drops only that schema.
// Set DATABASE_URL to a PostgreSQL database where CREATE SCHEMA is allowed.
const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
databaseDescribe('Receipt PDF PostgreSQL queue and authenticated HTTP', () => {
  let db: Db, app: INestApplication, service: ReceiptPdfService, renderer: ReceiptPdfRenderer;
  let schoolId: string, studentId: string, admin: Session, accountant: Session, teacher: Session, outsider: Session, superadmin: Session;
  const schema = `receipt_pdf_test_${randomUUID().replace(/-/g, '')}`;
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
  type Session = { actor: Actor; token: string; csrf: string };
  const http = (session: Session, method: 'get' | 'post', path: string) => request(app.getHttpServer())[method](`/api/v1/receipts/${path}`)
    .set('Cookie', `pcdav_session=${session.token}`).set('Origin', origin).set('X-CSRF-Token', session.csrf);

  async function session(role: Role, school = schoolId): Promise<Session> {
    const user = await db.user.create({ data: { schoolId: school, name: role, email: `${randomUUID()}@example.test`, role, passwordHash: 'unused-session-fixture', mustChangePassword: false } });
    const token = randomUUID(), csrf = randomUUID();
    await db.loginSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), csrfToken: csrf, expiresAt: new Date(Date.now() + 60_000 * 10) } });
    return { actor: publicUser(user), token, csrf };
  }

  async function fixture(options: { enqueue?: boolean; studentName?: string } = {}) {
    // A committed payment/receipt is the module's input. The queue runs only
    // afterwards, independently of the original financial transaction.
    const payment = await db.payment.create({ data: { schoolId, studentId, cashierId: admin.actor.id, shiftId: randomUUID(), idempotencyKey: randomUUID(), requestHash: 'fixture', businessDate: new Date('2026-10-13'), mode: 'CASH', status: 'CAPTURED', receivedAmountMinor: 9007199254740993n, tenderedAmountMinor: 9007199254741000n, changeMinor: 7n, payerName: 'Original Guardian' } });
    const receipt = original('ISSUED', 1, { schoolId, studentId, paymentId: payment.id });
    if (options.studentName) receipt.snapshot.student.name = options.studentName;
    await db.receipt.create({ data: { ...receipt, snapshot: receipt.snapshot as Prisma.InputJsonValue } });
    if (options.enqueue !== false) await enqueue(receipt.id, 'ISSUED');
    return receipt;
  }

  async function enqueue(receiptId: string, receiptStatus: string) {
    return db.receiptPdfJob.create({ data: { schoolId, receiptId, receiptStatus, requestedBy: admin.actor.id } });
  }

  async function job(receiptId: string, receiptStatus = 'ISSUED') {
    return db.receiptPdfJob.findUniqueOrThrow({ where: { receiptId_receiptStatus: { receiptId, receiptStatus } } });
  }

  async function age(receiptId: string) {
    await db.$executeRaw`UPDATE "ReceiptPdfJob" SET "updatedAt" = CURRENT_TIMESTAMP - interval '3 minutes' WHERE "receiptId" = ${receiptId}`;
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('schema', schema);
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 60_000 });
    db = new Db({ datasources: { db: { url: url.toString() } } });
    const module = await Test.createTestingModule({ controllers: [ReceiptPdfController], providers: [
      { provide: Db, useValue: db }, ReceiptPdfService, ReceiptPdfRenderer, { provide: APP_GUARD, useClass: AuthGuard },
    ] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new ApiErrors());
    await app.init();
    service = app.get(ReceiptPdfService);
    renderer = app.get(ReceiptPdfRenderer);
    schoolId = (await db.school.create({ data: { name: 'Live school', admissionPrefix: 'PDF' } })).id;
    const family = await db.family.create({ data: { schoolId, label: 'PDF family' } });
    studentId = (await db.student.create({ data: { schoolId, familyId: family.id, name: 'Live student', admissionNumber: 'PDF-001', dateOfBirth: new Date('2015-01-02'), gender: 'BOY', admissionDate: new Date('2026-04-01') } })).id;
    admin = await session('ADMIN'); accountant = await session('ACCOUNTANT'); teacher = await session('TEACHER'); superadmin = await session('SUPERADMIN');
    const otherSchool = await db.school.create({ data: { name: 'Other school', admissionPrefix: 'OTHER' } });
    outsider = await session('ADMIN', otherSchool.id);
  }, 90_000);

  afterAll(async () => {
    if (db) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await app?.close();
    await db?.$disconnect();
  });

  it('requires authentication, financial roles, same school, CSRF/origin and a meaningful reason on all endpoints', async () => {
    const receipt = await fixture({ enqueue: false });
    for (const [method, suffix] of [['get', 'pdf'], ['get', 'pdf/status'], ['post', 'pdf/retry']] as const) {
      await request(app.getHttpServer())[method](`/api/v1/receipts/${receipt.id}/${suffix}`).send(method === 'post' ? { reason: 'Retry PDF' } : undefined).expect(401);
      await http(teacher, method, `${receipt.id}/${suffix}`).send(method === 'post' ? { reason: 'Retry PDF' } : undefined).expect(403);
      await http(outsider, method, `${receipt.id}/${suffix}`).send(method === 'post' ? { reason: 'Retry PDF' } : undefined).expect(404);
    }
    for (const actor of [admin, accountant, superadmin]) await http(actor, 'get', `${receipt.id}/pdf/status`).expect(200).expect(response => expect(response.body).toEqual({ status: 'UNAVAILABLE', attempts: 0, errorCode: 'JOB_MISSING', downloadAvailable: false }));
    await http(accountant, 'post', `${receipt.id}/pdf/retry`).unset('X-CSRF-Token').send({ reason: 'Retry PDF' }).expect(403);
    await http(accountant, 'post', `${receipt.id}/pdf/retry`).set('Origin', 'https://foreign.example').send({ reason: 'Retry PDF' }).expect(403);
    for (const body of [{}, { reason: '   ' }, { reason: 'ab' }, { reason: 'a'.repeat(501) }, { reason: 'Retry PDF', schoolId: outsider.actor.schoolId }]) {
      await http(accountant, 'post', `${receipt.id}/pdf/retry`).send(body).expect(400);
    }
    await expect(service.status(teacher.actor, receipt.id)).rejects.toMatchObject({ status: 403 });
    await http(accountant, 'post', `${receipt.id}/pdf/retry`).send({ reason: 'Create missing PDF job' }).expect(202);
    await new ReceiptPdfWorker(db, renderer).runBatch();
  });

  it('returns explicit retryable 503 until durable bytes exist, then downloads private PDF originals despite live name edits', async () => {
    const receipt = await fixture();
    await http(accountant, 'get', `${receipt.id}/pdf`).expect(503).expect('Retry-After', '5').expect(response => expect(response.body.message).toContain('Payment remains recorded'));
    await db.school.update({ where: { id: schoolId }, data: { name: 'Renamed live school' } });
    await db.student.update({ where: { id: studentId }, data: { name: 'Renamed live student' } });
    await new ReceiptPdfWorker(db, renderer).runBatch();
    const saved = await job(receipt.id);
    expect(saved.status).toBe('READY');
    expect(saved.sha256).toBe(createHash('sha256').update(saved.content!).digest('hex'));
    await http(accountant, 'get', `${receipt.id}/pdf/status`).expect(200).expect(response => expect(response.body).toEqual({ status: 'READY', attempts: 1, errorCode: null, downloadAvailable: true }));
    const downloaded = await http(accountant, 'get', `${receipt.id}/pdf`).expect(200).expect('Content-Type', 'application/pdf').expect('Cache-Control', 'private, no-store, max-age=0');
    expect(downloaded.headers['content-disposition']).toContain(`receipt-${receipt.id}-ISSUED.pdf`);
    expect(downloaded.headers['retry-after']).toBeUndefined();
    expect(Buffer.isBuffer(downloaded.body)).toBe(true);
    const text = pdfPages(downloaded.body).join('\n');
    expect(text).toContain('Original School'); expect(text).toContain('Original Student'); expect(text).not.toContain('Renamed live');
    expect((await db.receipt.findUniqueOrThrow({ where: { id: receipt.id } })).snapshot).toEqual(receipt.snapshot);
    await http(accountant, 'post', `${receipt.id}/pdf/retry`).send({ reason: 'Already available' }).expect(409);
  });

  it('never substitutes an old ready PDF when the current status changes', async () => {
    const receipt = await fixture();
    await new ReceiptPdfWorker(db, renderer).runBatch();
    const originalHash = (await job(receipt.id)).sha256;
    for (const status of ['PARTIALLY_REFUNDED', 'REFUNDED', 'VOID']) {
      await db.$transaction(async tx => {
        await tx.receipt.update({ where: { id: receipt.id }, data: { status } });
        await tx.receiptPdfJob.create({ data: { schoolId, receiptId: receipt.id, receiptStatus: status, requestedBy: admin.actor.id } });
      });
      await http(admin, 'get', `${receipt.id}/pdf`).expect(503);
      expect((await service.status(admin.actor, receipt.id)).downloadAvailable).toBe(false);
      await new ReceiptPdfWorker(db, renderer).runBatch();
      const text = pdfPages((await service.download(admin.actor, receipt.id)).content).join('\n');
      expect(text).toContain(status === 'PARTIALLY_REFUNDED' ? 'PARTIALLY REFUNDED' : status);
      expect(text).toContain('Original Student');
      expect((await db.receipt.findUniqueOrThrow({ where: { id: receipt.id } })).snapshot).toEqual(receipt.snapshot);
    }
    expect((await job(receipt.id)).sha256).toBe(originalHash);
  });

  it('caps automatic failures, deduplicates audited manual retries and preserves monotonic fencing attempts', async () => {
    const receipt = await fixture();
    const failing = new ReceiptPdfWorker(db, { render: jest.fn().mockRejectedValue(new Error('internal rendering detail')) } as ReceiptPdfRenderer);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await failing.runBatch();
      expect(await job(receipt.id)).toMatchObject({ status: attempt === 3 ? 'FAILED' : 'PENDING', attempts: attempt, content: null, errorCode: 'PDF_RENDER_FAILED' });
      expect(await failing.runBatch()).toBe(0);
      await age(receipt.id);
    }
    expect(await failing.runBatch()).toBe(0);
    await Promise.all([1, 2, 3].map(() => http(accountant, 'post', `${receipt.id}/pdf/retry`).send({ reason: 'Renderer repaired; regenerate receipt' }).expect(202)));
    expect(await db.auditEvent.count({ where: { entityId: receipt.id, action: 'RECEIPT_PDF_RETRY_REQUESTED' } })).toBe(1);
    expect(await job(receipt.id)).toMatchObject({ status: 'PENDING', attempts: 3, requestedBy: accountant.actor.id });
    await new ReceiptPdfWorker(db, renderer).runBatch();
    expect(await job(receipt.id)).toMatchObject({ status: 'READY', attempts: 4 });
    expect((await db.payment.findUniqueOrThrow({ where: { id: receipt.paymentId } })).receivedAmountMinor).toBe(9007199254740993n);
  });

  it('reports unsupported text as FAILED with no false download availability or mutation of the original', async () => {
    const receipt = await fixture({ studentName: 'आरव शर्मा' });
    await new ReceiptPdfWorker(db, renderer).runBatch();
    expect(await service.status(admin.actor, receipt.id)).toEqual({ status: 'FAILED', attempts: 1, errorCode: 'UNSUPPORTED_TEXT', downloadAvailable: false });
    await http(admin, 'get', `${receipt.id}/pdf`).expect(503).expect(response => expect(response.body.message).toContain('UNSUPPORTED_TEXT'));
    expect((await db.receipt.findUniqueOrThrow({ where: { id: receipt.id } })).snapshot).toEqual(receipt.snapshot);
  });

  it.each(['success', 'failure'])('recovers a crashed lease and rejects the old worker late %s without corrupting the winner', async outcome => {
    const receipt = await fixture();
    let resolve!: (content: Buffer) => void, reject!: (error: Error) => void, started!: () => void;
    const gate = new Promise<Buffer>((yes, no) => { resolve = yes; reject = no; });
    const claimed = new Promise<void>(yes => { started = yes; });
    const first = new ReceiptPdfWorker(db, { render: jest.fn(() => { started(); return gate; }) } as ReceiptPdfRenderer);
    const pending = first.runBatch();
    await claimed;
    expect(await first.runBatch()).toBe(0);
    expect(await new ReceiptPdfWorker(db, renderer).runBatch()).toBe(0);
    await age(receipt.id);
    await new ReceiptPdfWorker(db, renderer).runBatch();
    const winner = await job(receipt.id);
    expect(winner).toMatchObject({ status: 'READY', attempts: 2 });
    if (outcome === 'success') resolve(Buffer.from('%PDF-obsolete worker output'));
    else reject(new Error('Late obsolete failure'));
    await pending;
    const after = await job(receipt.id);
    expect(after.sha256).toBe(winner.sha256);
    expect(after.content).toEqual(winner.content);
    expect(after.status).toBe('READY');
  });

  it('will not publish an in-flight original after a concurrent VOID correction', async () => {
    const receipt = await fixture();
    let finish!: (content: Buffer) => void, start!: () => void;
    const held = new Promise<Buffer>(resolve => { finish = resolve; });
    const started = new Promise<void>(resolve => { start = resolve; });
    const worker = new ReceiptPdfWorker(db, { render: jest.fn(() => { start(); return held; }) } as ReceiptPdfRenderer);
    const running = worker.runBatch();
    await started;
    await db.receipt.update({ where: { id: receipt.id }, data: { status: 'VOID' } });
    await enqueue(receipt.id, 'VOID');
    await http(admin, 'get', `${receipt.id}/pdf`).expect(503);
    await new ReceiptPdfWorker(db, renderer).runBatch();
    finish(Buffer.from('%PDF-original in flight'));
    await running;
    expect(await job(receipt.id)).toMatchObject({ status: 'FAILED', content: null, errorCode: 'RECEIPT_STATUS_CHANGED' });
    expect(pdfPages((await service.download(admin.actor, receipt.id)).content).join('\n')).toContain('NOT A VALID PAYMENT RECEIPT');
  });

  it('caps expired-lease recovery and processes at most the bounded batch size', async () => {
    const receipt = await fixture();
    await db.receiptPdfJob.update({ where: { id: (await job(receipt.id)).id }, data: { status: 'PROCESSING', attempts: 3 } });
    await age(receipt.id);
    await new ReceiptPdfWorker(db, renderer).runBatch();
    expect(await job(receipt.id)).toMatchObject({ status: 'FAILED', errorCode: 'LEASE_EXPIRED', attempts: 3 });
    const receipts = await Promise.all(Array.from({ length: 5 }, () => fixture()));
    expect(await new ReceiptPdfWorker(db, renderer).runBatch()).toBe(RECEIPT_PDF_BATCH_SIZE);
    const states = await Promise.all(receipts.map(receipt => job(receipt.id)));
    expect(states.filter(value => value.status === 'READY')).toHaveLength(RECEIPT_PDF_BATCH_SIZE);
    const worker = new ReceiptPdfWorker(db, renderer);
    while (await worker.runBatch()) { /* drain this test's remaining jobs */ }
  });

  it('refuses corrupted bytes and permits an audited repair retry', async () => {
    const receipt = await fixture();
    await new ReceiptPdfWorker(db, renderer).runBatch();
    await db.receiptPdfJob.update({ where: { id: (await job(receipt.id)).id }, data: { content: Buffer.from('%PDF-corrupted bytes'), sha256: '0'.repeat(64) } });
    expect(await service.status(admin.actor, receipt.id)).toMatchObject({ status: 'FAILED', errorCode: 'CONTENT_INVALID', downloadAvailable: false });
    await http(admin, 'get', `${receipt.id}/pdf`).expect(503).expect(response => expect(response.body.message).toContain('CONTENT_INVALID'));
    await http(admin, 'post', `${receipt.id}/pdf/retry`).send({ reason: 'Repair corrupted stored content' }).expect(202);
    await new ReceiptPdfWorker(db, renderer).runBatch();
    await http(admin, 'get', `${receipt.id}/pdf`).expect(200);
  });

  it('atomically claims each job once when separate workers poll concurrently', async () => {
    const receipts = await Promise.all(Array.from({ length: 4 }, () => fixture()));
    const render = jest.fn((receipt: Parameters<ReceiptPdfRenderer['render']>[0]) => renderer.render(receipt));
    await Promise.all([new ReceiptPdfWorker(db, { render }), new ReceiptPdfWorker(db, { render })].map(worker => worker.runBatch()));
    expect(render).toHaveBeenCalledTimes(4);
    expect(new Set(render.mock.calls.map(([receipt]) => receipt.id)).size).toBe(4);
    for (const receipt of receipts) expect(await job(receipt.id)).toMatchObject({ status: 'READY', attempts: 1 });
  });

  it('rejects a mismatched job school without rendering or exposing its content', async () => {
    const receipt = await fixture({ enqueue: false });
    await db.receiptPdfJob.create({ data: { schoolId: outsider.actor.schoolId, receiptId: receipt.id, receiptStatus: 'ISSUED', requestedBy: outsider.actor.id } });
    expect(await new ReceiptPdfWorker(db, renderer).runBatch()).toBe(0);
    expect(await service.status(admin.actor, receipt.id)).toMatchObject({ status: 'UNAVAILABLE', downloadAvailable: false });
    await http(admin, 'post', `${receipt.id}/pdf/retry`).send({ reason: 'Retry mismatched job' }).expect(409);
    await http(outsider, 'get', `${receipt.id}/pdf`).expect(404);
    expect(await job(receipt.id)).toMatchObject({ status: 'PENDING', attempts: 0, content: null });
  });
});
