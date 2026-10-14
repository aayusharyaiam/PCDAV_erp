import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Db } from './db';
import { ReceiptPdfOriginal, ReceiptPdfRenderError, ReceiptPdfRenderer, RECEIPT_PDF_MAX_BYTES } from './receipt-pdf.renderer';

export const RECEIPT_PDF_MAX_ATTEMPTS = 3;
export const RECEIPT_PDF_LEASE_MS = 120_000;
export const RECEIPT_PDF_POLL_MS = 5_000;
export const RECEIPT_PDF_BATCH_SIZE = 2;
export type ReceiptPdfClaim = { id: string; schoolId: string; receiptId: string; receiptStatus: string; status: string; attempts: number };

@Injectable()
export class ReceiptPdfWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReceiptPdfWorker.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;
  private stopped = false;

  constructor(private readonly db: Db, private readonly renderer: ReceiptPdfRenderer) {}

  onApplicationBootstrap() { this.schedule(0); }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.runBatch().catch(() => this.logger.warn('Receipt PDF queue unavailable; durable jobs will be retried'))
        .finally(() => this.schedule(RECEIPT_PDF_POLL_MS));
    }, delay);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running?.catch(() => undefined);
  }

  // Exposed for operational checks/tests; the lifecycle timer uses the same path.
  async runBatch(): Promise<number> {
    if (this.stopped || this.running) return 0;
    this.running = this.processBatch();
    try { return await this.running; }
    finally { this.running = undefined; }
  }

  private async processBatch(): Promise<number> {
    let processed = 0;
    while (!this.stopped && processed < RECEIPT_PDF_BATCH_SIZE) {
      const job = await this.claim();
      if (!job) break;
      processed++;
      if (job.status === 'FAILED') continue;
      const receipts = await this.db.$queryRaw<ReceiptPdfOriginal[]>(Prisma.sql`
        SELECT "id", "schoolId", "studentId", "paymentId", "receiptNumber", "status", "issuedAt", "templateVersion", "snapshot"
        FROM "Receipt" WHERE "id" = ${job.receiptId} AND "schoolId" = ${job.schoolId} AND "status" = ${job.receiptStatus}
      `);
      if (!receipts[0]) { await this.fail(job, 'RECEIPT_STATUS_CHANGED', true); continue; }
      try {
        const content = await this.renderer.render(receipts[0]);
        if (content.length > RECEIPT_PDF_MAX_BYTES || content.length < 8 || content.subarray(0, 5).toString('ascii') !== '%PDF-') {
          await this.fail(job, 'CONTENT_INVALID', true);
          continue;
        }
        const sha256 = createHash('sha256').update(content).digest('hex');
        // attempts is a monotonic fencing token. Both success and failure writes
        // require ownership and an unexpired lease; stale processes cannot win.
        const saved = await this.db.$executeRaw(Prisma.sql`
          UPDATE "ReceiptPdfJob" j SET "status" = 'READY', "content" = ${content}, "sha256" = ${sha256},
            "errorCode" = NULL, "updatedAt" = CURRENT_TIMESTAMP
          FROM "Receipt" r WHERE j."id" = ${job.id} AND j."schoolId" = ${job.schoolId}
            AND j."status" = 'PROCESSING' AND j."attempts" = ${job.attempts}
            AND j."updatedAt" > CURRENT_TIMESTAMP - ${RECEIPT_PDF_LEASE_MS} * interval '1 millisecond'
            AND r."id" = j."receiptId" AND r."schoolId" = j."schoolId" AND r."status" = j."receiptStatus"
        `);
        if (!saved) await this.fail(job, 'RECEIPT_STATUS_CHANGED', true);
      } catch (error) {
        const permanent = error instanceof ReceiptPdfRenderError;
        await this.fail(job, permanent ? error.code : 'PDF_RENDER_FAILED', permanent);
      }
    }
    return processed;
  }

  private async claim(): Promise<ReceiptPdfClaim | undefined> {
    // No financial transaction is held during rendering. SKIP LOCKED works with
    // multiple API processes, and database time avoids cross-process clock skew.
    const jobs = await this.db.$queryRaw<ReceiptPdfClaim[]>(Prisma.sql`
      WITH candidate AS (
        SELECT j."id" FROM "ReceiptPdfJob" j JOIN "Receipt" r
          ON r."id" = j."receiptId" AND r."schoolId" = j."schoolId" AND r."status" = j."receiptStatus"
        WHERE (j."status" = 'PENDING' AND (j."errorCode" IS NULL OR
          j."updatedAt" <= CURRENT_TIMESTAMP - LEAST(j."attempts", ${RECEIPT_PDF_MAX_ATTEMPTS}) * interval '10 seconds'))
          OR (j."status" = 'PROCESSING' AND j."updatedAt" <= CURRENT_TIMESTAMP - ${RECEIPT_PDF_LEASE_MS} * interval '1 millisecond')
        ORDER BY j."updatedAt", j."id" LIMIT 1 FOR UPDATE OF j SKIP LOCKED
      )
      UPDATE "ReceiptPdfJob" j SET
        "status" = CASE WHEN j."status" = 'PROCESSING' AND j."attempts" >= ${RECEIPT_PDF_MAX_ATTEMPTS} THEN 'FAILED' ELSE 'PROCESSING' END,
        "errorCode" = CASE WHEN j."status" = 'PROCESSING' AND j."attempts" >= ${RECEIPT_PDF_MAX_ATTEMPTS} THEN 'LEASE_EXPIRED' ELSE NULL END,
        "attempts" = CASE WHEN j."status" = 'PROCESSING' AND j."attempts" >= ${RECEIPT_PDF_MAX_ATTEMPTS} THEN j."attempts" ELSE j."attempts" + 1 END,
        "content" = NULL, "sha256" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      FROM candidate c WHERE j."id" = c."id"
      RETURNING j."id", j."schoolId", j."receiptId", j."receiptStatus", j."status", j."attempts"
    `);
    return jobs[0];
  }

  private async fail(job: ReceiptPdfClaim, code: string, permanent: boolean) {
    await this.db.$executeRaw(Prisma.sql`
      UPDATE "ReceiptPdfJob" SET "status" = ${permanent || job.attempts >= RECEIPT_PDF_MAX_ATTEMPTS ? 'FAILED' : 'PENDING'},
        "content" = NULL, "sha256" = NULL, "errorCode" = ${code}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${job.id} AND "schoolId" = ${job.schoolId} AND "status" = 'PROCESSING' AND "attempts" = ${job.attempts}
        AND "updatedAt" > CURRENT_TIMESTAMP - ${RECEIPT_PDF_LEASE_MS} * interval '1 millisecond'
    `);
  }
}
