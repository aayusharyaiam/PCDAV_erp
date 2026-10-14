import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { Actor } from './auth';
import { audit, Db } from './db';
import { RECEIPT_PDF_MAX_BYTES } from './receipt-pdf.renderer';

export const RECEIPT_PDF_ROLES: Role[] = [Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT];
export type ReceiptPdfStatus = { status: string; attempts: number; errorCode: string | null; downloadAvailable: boolean };
type CurrentJob = {
  receiptId: string; receiptNumber: string; receiptStatus: string;
  jobId: string | null; status: string | null; attempts: number | null; errorCode: string | null;
  sha256: string | null; hasContent: boolean; content: Uint8Array | null;
};

@Injectable()
export class ReceiptPdfService {
  constructor(private readonly db: Db) {}

  private authorize(actor: Actor) {
    if (!actor || !RECEIPT_PDF_ROLES.includes(actor.role)) throw new ForbiddenException('Financial role required');
  }

  private async current(actor: Actor, id: string): Promise<CurrentJob> {
    this.authorize(actor);
    // One statement snapshot joins ONLY the current status; there is no separate
    // receipt read followed by a race-prone old-status blob lookup.
    const rows = await this.db.$queryRaw<CurrentJob[]>(Prisma.sql`
      SELECT r."id" AS "receiptId", r."receiptNumber", r."status" AS "receiptStatus",
        j."id" AS "jobId", j."status", j."attempts", j."errorCode", j."sha256",
        COALESCE(octet_length(j."content") BETWEEN 8 AND ${RECEIPT_PDF_MAX_BYTES}
          AND substring(j."content" from 1 for 5) = decode('255044462d', 'hex'), false) AS "hasContent",
        CASE WHEN j."status" = 'READY' THEN j."content" ELSE NULL END AS "content"
      FROM "Receipt" r LEFT JOIN "ReceiptPdfJob" j
        ON j."receiptId" = r."id" AND j."schoolId" = r."schoolId" AND j."receiptStatus" = r."status"
      WHERE r."id" = ${id} AND r."schoolId" = ${actor.schoolId}
    `);
    if (!rows[0]) throw new NotFoundException('Receipt not found');
    return rows[0];
  }

  private view(job: CurrentJob): ReceiptPdfStatus {
    const ready = job.status === 'READY' && job.hasContent && job.content !== null &&
      createHash('sha256').update(job.content).digest('hex') === job.sha256;
    return {
      status: job.status === 'READY' && !ready ? 'FAILED' : job.status ?? 'UNAVAILABLE',
      attempts: job.attempts ?? 0,
      errorCode: job.status === 'READY' && !ready ? 'CONTENT_INVALID' : job.errorCode ?? (job.jobId ? null : 'JOB_MISSING'),
      downloadAvailable: ready,
    };
  }

  async status(actor: Actor, id: string): Promise<ReceiptPdfStatus> {
    return this.view(await this.current(actor, id));
  }

  async download(actor: Actor, id: string) {
    const job = await this.current(actor, id);
    const view = this.view(job);
    const content = job.content ? Buffer.from(job.content) : null;
    if (!view.downloadAvailable || !content) {
      const code = view.downloadAvailable ? 'CONTENT_INVALID' : view.errorCode ?? view.status;
      // ApiErrors retains message; keep the actionable retry state in that field.
      throw new ServiceUnavailableException({
        message: `Receipt PDF is unavailable (${code}). Retry this download after generation, or request PDF retry with a reason. Payment remains recorded.`,
        retryable: true, errorCode: code,
      });
    }
    // Do not interpolate an original name or receipt number into an HTTP header.
    const safeId = job.receiptId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    const safeStatus = job.receiptStatus.replace(/[^A-Z_]/g, '_').slice(0, 40);
    return { content, filename: `receipt-${safeId}-${safeStatus}.pdf` };
  }

  async retry(actor: Actor, id: string, reason: string): Promise<ReceiptPdfStatus> {
    this.authorize(actor);
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) throw new BadRequestException('A retry reason of 3 to 500 characters is required');
    await this.db.atomic(async tx => {
      // Serialize status corrections and concurrent manual retries on the receipt.
      const receipts = await tx.$queryRaw<{ id: string; status: string }[]>(Prisma.sql`
        SELECT "id", "status" FROM "Receipt" WHERE "id" = ${id} AND "schoolId" = ${actor.schoolId} FOR UPDATE
      `);
      const receipt = receipts[0];
      if (!receipt) throw new NotFoundException('Receipt not found');
      const jobs = await tx.$queryRaw<{ id: string; status: string; attempts: number; content: Uint8Array | null; sha256: string | null }[]>(Prisma.sql`
        SELECT "id", "status", "attempts", "content", "sha256" FROM "ReceiptPdfJob"
        WHERE "receiptId" = ${id} AND "schoolId" = ${actor.schoolId} AND "receiptStatus" = ${receipt.status} FOR UPDATE
      `);
      const job = jobs[0];
      if (job?.status === 'PENDING' || job?.status === 'PROCESSING') return;
      if (job?.status === 'READY' && job.content && job.content.length >= 8 && job.content.length <= RECEIPT_PDF_MAX_BYTES &&
          Buffer.from(job.content).subarray(0, 5).toString('ascii') === '%PDF-' && createHash('sha256').update(job.content).digest('hex') === job.sha256) {
        throw new ConflictException('The current receipt PDF is already available');
      }
      const jobId = job?.id ?? randomUUID();
      // attempts NEVER resets: it is also the fencing generation for old workers.
      // After the automatic limit, an audited manual retry grants one new attempt.
      const enqueued = await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ReceiptPdfJob" ("id", "schoolId", "receiptId", "receiptStatus", "status", "attempts", "requestedBy", "createdAt", "updatedAt")
        VALUES (${jobId}, ${actor.schoolId}, ${id}, ${receipt.status}, 'PENDING', 0, ${actor.id}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("receiptId", "receiptStatus") DO UPDATE SET
          "status" = 'PENDING', "content" = NULL, "sha256" = NULL, "errorCode" = NULL,
          "requestedBy" = ${actor.id}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "ReceiptPdfJob"."schoolId" = ${actor.schoolId}
      `);
      if (enqueued !== 1) throw new ConflictException('Receipt PDF job scope mismatch');
      await audit(tx, actor, 'RECEIPT_PDF_RETRY_REQUESTED', 'Receipt', id, reason.trim(),
        { jobId: job?.id ?? null, status: job?.status ?? 'UNAVAILABLE', attempts: job?.attempts ?? 0 },
        { jobId, receiptStatus: receipt.status, status: 'PENDING' });
    });
    return this.status(actor, id);
  }
}
