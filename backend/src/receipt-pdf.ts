import { ReceiptPdfController } from './receipt-pdf.controller';
import { ReceiptPdfRenderer } from './receipt-pdf.renderer';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceiptPdfWorker } from './receipt-pdf.worker';

// Spread into the parent module's controllers/providers. Reuses its Db and
// global AuthGuard. Remove the former metadata-only GET route before registering.
export const RECEIPT_PDF_CONTROLLERS = [ReceiptPdfController];
export const RECEIPT_PDF_PROVIDERS = [ReceiptPdfRenderer, ReceiptPdfService, ReceiptPdfWorker];
export { ReceiptPdfController, ReceiptPdfRenderer, ReceiptPdfService, ReceiptPdfWorker };
