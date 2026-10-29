import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

export const RECEIPT_PDF_MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 100;
const MAX_LINES = 2000;

export const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

function resolveFont(filename: string): string | null {
  const dirs = [
    path.resolve(__dirname, '../assets/fonts'),
    path.resolve(__dirname, '../../assets/fonts'),
    path.resolve(process.cwd(), 'assets/fonts'),
    path.resolve(process.cwd(), 'backend/assets/fonts'),
  ];
  for (const dir of dirs) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export class ReceiptPdfRenderError extends Error {
  constructor(readonly code: 'INVALID_SNAPSHOT' | 'UNSUPPORTED_TEXT' | 'PDF_LIMIT_EXCEEDED') { super(code); }
}

export type ReceiptPdfOriginal = {
  id: string; schoolId: string; studentId: string; paymentId: string;
  receiptNumber: string; status: string; issuedAt: Date; templateVersion: string; snapshot: unknown;
};

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReceiptPdfRenderError('INVALID_SNAPSHOT');
  return value as JsonObject;
}

// Repertoire supporting Latin WinAnsi and Devanagari script (U+0900-U+097F plus joiners).
// Deliberately excludes unencoded glyphs, controls, and uncomposed combining marks.
export function receiptPdfText(value: unknown, optional = false): string {
  if (optional && (value === null || value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new ReceiptPdfRenderError('INVALID_SNAPSHOT');
  if (!/^[\x20-\x7e\n\r\u00a0-\u00ac\u00ae-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u0900-\u097F\u200C\u200D]+$/.test(value)) {
    throw new ReceiptPdfRenderError('UNSUPPORTED_TEXT');
  }
  return value;
}

export function receiptPdfAmount(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,29})$/.test(value)) throw new ReceiptPdfRenderError('INVALID_SNAPSHOT');
  const paise = BigInt(value);
  return `${paise / 100n}.${(paise % 100n).toString().padStart(2, '0')}`;
}

const STATUS_LABELS: Record<string, string> = {
  ISSUED: 'ISSUED - original payment receipt',
  VOID: 'VOID - NOT A VALID PAYMENT RECEIPT',
  PARTIALLY_REFUNDED: 'PARTIALLY REFUNDED - original amounts retained',
  REFUNDED: 'REFUNDED - original payment refunded',
};

@Injectable()
export class ReceiptPdfRenderer {
  async render(receipt: ReceiptPdfOriginal): Promise<Buffer> {
    const snapshot = object(receipt.snapshot);
    if (JSON.stringify(snapshot).length > 1024 * 1024) throw new ReceiptPdfRenderError('PDF_LIMIT_EXCEEDED');
    // Validate all stored strings, including identifiers and future optional fields.
    const validateText = (value: unknown): void => {
      if (typeof value === 'string' && value !== '') receiptPdfText(value);
      else if (Array.isArray(value)) value.forEach(validateText);
      else if (value && typeof value === 'object') Object.values(value).forEach(validateText);
    };
    validateText(snapshot);
    const school = object(snapshot.school), student = object(snapshot.student), payer = object(snapshot.payer);
    const payment = object(snapshot.payment), allocation = object(snapshot.allocation), collector = object(snapshot.collector);
    if (school.id !== receipt.schoolId || student.id !== receipt.studentId || payment.id !== receipt.paymentId ||
        snapshot.receiptNumber !== receipt.receiptNumber || snapshot.templateVersion !== receipt.templateVersion ||
        payment.issuedAt !== receipt.issuedAt.toISOString() || snapshot.currency !== 'INR' || !STATUS_LABELS[receipt.status]) {
      throw new ReceiptPdfRenderError('INVALID_SNAPSHOT');
    }
    [receipt.id, receipt.schoolId, receipt.studentId, receipt.paymentId, receipt.receiptNumber, receipt.templateVersion].forEach(value => receiptPdfText(value));
    if (!Array.isArray(allocation.lines)) throw new ReceiptPdfRenderError('INVALID_SNAPSHOT');
    if (allocation.lines.length > MAX_LINES) throw new ReceiptPdfRenderError('PDF_LIMIT_EXCEEDED');
    const lines = allocation.lines.map(value => {
      const row = object(value);
      return [
        `${receiptPdfText(row.description)}\n${receiptPdfText(row.targetType)}: ${receiptPdfText(row.reference)}\nSource: ${receiptPdfText(row.targetId)}\nDue: ${receiptPdfText(row.dueDate)}`,
        receiptPdfAmount(row.beforeOutstandingMinor), receiptPdfAmount(row.creditAppliedMinor),
        receiptPdfAmount(row.paymentAllocatedMinor), receiptPdfAmount(row.afterOutstandingMinor),
      ];
    });

    const devanagariRegular = resolveFont('NotoSansDevanagari-Regular.ttf');
    const devanagariBold = resolveFont('NotoSansDevanagari-Bold.ttf');
    const hasDevanagariSupport = !!(devanagariRegular && devanagariBold);

    const containsDevanagari = (val: unknown): boolean => {
      if (typeof val === 'string') return DEVANAGARI_REGEX.test(val);
      if (Array.isArray(val)) return val.some(containsDevanagari);
      if (val && typeof val === 'object') return Object.values(val).some(containsDevanagari);
      return false;
    };

    if (containsDevanagari(snapshot) && !hasDevanagariSupport) {
      throw new ReceiptPdfRenderError('UNSUPPORTED_TEXT');
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, autoFirstPage: false, info: {
      Title: `Receipt ${receipt.receiptNumber} - ${receipt.status}`, Author: receiptPdfText(school.name),
      Subject: 'Immutable original payment receipt with current status', CreationDate: receipt.issuedAt,
    } });
    if (hasDevanagariSupport) {
      doc.registerFont('Devanagari', devanagariRegular!);
      doc.registerFont('Devanagari-Bold', devanagariBold!);
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    const completed = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > RECEIPT_PDF_MAX_BYTES) doc.destroy(new ReceiptPdfRenderError('PDF_LIMIT_EXCEEDED'));
        else chunks.push(chunk);
      });
      doc.once('error', reject);
      doc.once('end', () => resolve(Buffer.concat(chunks)));
    });
    // A synchronous layout error must not leave an unhandled stream rejection.
    void completed.catch(() => undefined);
    try {
      const width = 515.28, left = 40, bottom = 750;
      let y = 0, pages = 0;
      const pickFont = (text: string, bold = false) => {
        if (DEVANAGARI_REGEX.test(text) && hasDevanagariSupport) {
          return bold ? 'Devanagari-Bold' : 'Devanagari';
        }
        return bold ? 'Helvetica-Bold' : 'Helvetica';
      };
      const newPage = () => {
        if (++pages > MAX_PAGES) throw new ReceiptPdfRenderError('PDF_LIMIT_EXCEEDED');
        doc.addPage();
        const label = STATUS_LABELS[receipt.status];
        doc.font(pickFont(label, true)).fontSize(12).fillColor(receipt.status === 'ISSUED' ? '#16344a' : '#9b1616');
        doc.text(label, left, 36, { width });
        y = doc.y + 7;
        const receiptHeading = `Receipt: ${receipt.receiptNumber}`;
        doc.font(pickFont(receiptHeading, false)).fontSize(10).fillColor('#111111').text(receiptHeading, left, y, { width });
        y = doc.y + 10;
        if (y > 200) throw new ReceiptPdfRenderError('PDF_LIMIT_EXCEEDED');
      };
      const block = (text: string, bold = false, size = 10) => {
        const fontName = pickFont(text, bold);
        doc.font(fontName).fontSize(size);
        const height = doc.heightOfString(text, { width }) + 6;
        if (y + height > bottom) newPage();
        doc.font(fontName).fontSize(size).fillColor('#111111');
        if (y + height > bottom) throw new ReceiptPdfRenderError('PDF_LIMIT_EXCEEDED');
        doc.text(text, left, y, { width });
        y += height;
      };
      newPage();
      block(receiptPdfText(school.name), true, 15);
      for (const key of ['address', 'phone', 'email']) {
        const value = receiptPdfText(school[key], true);
        if (value) block(`${key === 'address' ? 'Address' : key === 'phone' ? 'Phone' : 'Email'}: ${value}`);
      }
      block(`Original issue (UTC): ${receiptPdfText(payment.issuedAt)}`);
      block(`Student: ${receiptPdfText(student.name)} | Admission: ${receiptPdfText(student.admissionNumber)}`, true);
      if (snapshot.enrollment !== null && snapshot.enrollment !== undefined) {
        const enrollment = object(snapshot.enrollment);
        block(`Original class: ${receiptPdfText(enrollment.className, true)} | Session: ${receiptPdfText(enrollment.sessionId)}`);
        block(`Enrollment: ${receiptPdfText(enrollment.id)} | Class ID: ${receiptPdfText(enrollment.classId)}`, false, 8);
      }
      block(`Payer: ${receiptPdfText(payer.name)}${payer.phone ? ` | Phone: ${receiptPdfText(payer.phone)}` : ''}`);
      block(`Mode: ${receiptPdfText(payment.mode)} | Business date: ${receiptPdfText(payment.businessDate)}`);
      for (const [key, label] of Object.entries({ captureBusinessDate: 'Capture date', channel: 'Channel', reference: 'Reference', chequeNumber: 'Cheque number', chequeBank: 'Cheque bank', chequeDate: 'Cheque date' })) {
        const value = receiptPdfText(payment[key], true);
        if (value) block(`${label}: ${value}`);
      }
      block(`Original received: INR ${receiptPdfAmount(payment.receivedAmountMinor)}`, true, 12);
      if (payment.tenderedAmountMinor !== null && payment.tenderedAmountMinor !== undefined) block(`Original tendered: INR ${receiptPdfAmount(payment.tenderedAmountMinor)}`);
      block(`Change returned: INR ${receiptPdfAmount(payment.changeMinor)}`);
      block('Original allocations (INR) - values at issue, not current balances', true);
      const widths = [215.28, 75, 75, 75, 75];
      const tableRow = (cells: string[], header = false) => {
        const height = Math.max(...cells.map((cell, i) => {
          doc.font(pickFont(cell, header)).fontSize(8);
          return doc.heightOfString(cell, { width: widths[i] - 10 });
        })) + 14;
        if (y + height > bottom) {
          newPage();
          if (!header) tableRow(['Allocation / source', 'Before', 'Credit', 'Payment', 'Remaining'], true);
        }
        if (y + height > bottom) throw new ReceiptPdfRenderError('PDF_LIMIT_EXCEEDED');
        if (header) doc.rect(left, y, width, height).fill('#e8eef2').fillColor('#111111');
        let x = left;
        cells.forEach((cell, i) => {
          doc.font(pickFont(cell, header)).fontSize(8).fillColor('#111111');
          doc.text(cell, x + 5, y + 6, { width: widths[i] - 10, align: i === 0 ? 'left' : 'right' });
          x += widths[i];
        });
        doc.moveTo(left, y + height).lineTo(left + width, y + height).strokeColor('#b5b5b5').stroke();
        y += height;
      };
      tableRow(['Allocation / source', 'Before', 'Credit', 'Payment', 'Remaining'], true);
      for (let i = 0; i < lines.length; i++) {
        tableRow(lines[i]);
        if (i % 20 === 19) await new Promise<void>(resolve => setImmediate(resolve));
      }
      if (!lines.length) block('No due allocations; see original credit balance below.');
      y += 10;
      for (const [key, label] of Object.entries({ creditAppliedMinor: 'Credit applied', paymentAllocatedMinor: 'Payment allocated', projectedOutstandingMinor: 'Outstanding after issue', projectedCreditMinor: 'Credit balance after issue' })) {
        block(`${label}: INR ${receiptPdfAmount(allocation[key])}`);
      }
      block(`Collected by: ${receiptPdfText(collector.name)} (${receiptPdfText(collector.id)})`);
      block('School, student, payer, payment and allocation details above are the immutable original. Only the prominently displayed receipt status reflects a subsequent correction.', false, 9);
      if (receipt.status !== 'ISSUED') block('Original received/allocated values are not the current net paid amount. Consult the payment/refund ledger for correction amounts and dates.', true, 9);
      block('Synthetic demo receipt. Office-printer approval is pending.', false, 8);

      for (let i = 0; i < pages; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(7).fillColor('#333333');
        const footer = [
          `Receipt ID: ${receipt.id} | Payment ID: ${receipt.paymentId}`,
          `School ID: ${receipt.schoolId} | Student ID: ${receipt.studentId}`,
          `Template: ${receipt.templateVersion} | Current status: ${receipt.status} | Page ${i + 1} / ${pages}`,
        ];
        footer.forEach((line, index) => {
          if (doc.widthOfString(line) > width) throw new ReceiptPdfRenderError('PDF_LIMIT_EXCEEDED');
          doc.text(line, left, 779 + index * 10, { lineBreak: false });
        });
      }
      doc.end();
      return await completed;
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }
}
