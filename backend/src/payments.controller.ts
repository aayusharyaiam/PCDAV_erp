import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminOnly, Actor, CurrentUser, Roles } from './auth';
import {
  ChequeClearDto,
  CloseCashierShiftDto,
  CollectionReportDto,
  OpenCashierShiftDto,
  PaymentActionDto,
  PaymentCorrectionDto,
  PaymentDto,
  PaymentListDto,
  PaymentQuoteDto,
  PaymentRefundDto,
} from './dto';
import { PaymentService } from './payment.service';

const COLLECTION_ROLES = [Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT] as const;

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentService) {}

  @Post('payment-quotes') @Roles(...COLLECTION_ROLES)
  createQuote(@CurrentUser() actor: Actor, @Body() body: PaymentQuoteDto) { return this.payments.createQuote(actor, body); }

  @Get('payment-quotes/:id') @Roles(...COLLECTION_ROLES)
  getQuote(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.payments.getQuote(actor, id); }

  @Post('payments') @Roles(...COLLECTION_ROLES)
  createPayment(@CurrentUser() actor: Actor, @Body() body: PaymentDto, @Headers('idempotency-key') idempotencyKey?: string) { return this.payments.createPayment(actor, body, idempotencyKey); }

  @Get('payments') @Roles(...COLLECTION_ROLES)
  listPayments(@CurrentUser() actor: Actor, @Query() query: PaymentListDto) { return this.payments.listPayments(actor, query); }

  @Get('payments/:id') @Roles(...COLLECTION_ROLES)
  getPayment(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.payments.getPayment(actor, id); }

  @Post('payments/:id/clear-cheque') @Roles(...COLLECTION_ROLES)
  clearCheque(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: ChequeClearDto) { return this.payments.clearCheque(actor, id, body); }

  @Post('payments/:id/bounce') @AdminOnly()
  bounceCheque(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PaymentCorrectionDto) { return this.payments.bounceCheque(actor, id, body); }

  @Post('payments/:id/reverse') @AdminOnly()
  reverse(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PaymentCorrectionDto) { return this.payments.reverse(actor, id, body); }

  @Post('payments/:id/refunds') @AdminOnly()
  refund(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PaymentRefundDto, @Headers('idempotency-key') idempotencyKey?: string) { return this.payments.refund(actor, id, body, idempotencyKey); }

  @Get('receipts') @Roles(...COLLECTION_ROLES)
  listReceipts(@CurrentUser() actor: Actor, @Query() query: PaymentListDto) { return this.payments.listReceipts(actor, query); }

  @Get('receipts/:id') @Roles(...COLLECTION_ROLES)
  getReceipt(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.payments.getReceipt(actor, id); }

  @Get('receipts/:id/pdf') @Roles(...COLLECTION_ROLES)
  receiptPdf(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.payments.receiptPdfMetadata(actor, id); }

  @Post('receipts/:id/print-events') @Roles(...COLLECTION_ROLES)
  reprint(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PaymentActionDto) { return this.payments.reprint(actor, id, body.reason); }

  @Get('cashier-shifts') @Roles(...COLLECTION_ROLES)
  shifts(@CurrentUser() actor: Actor, @Query() query: PaymentListDto) { return this.payments.shifts(actor, query); }

  @Post('cashier-shifts') @Roles(...COLLECTION_ROLES)
  openShift(@CurrentUser() actor: Actor, @Body() body: OpenCashierShiftDto) { return this.payments.openShift(actor, body); }

  @Post('cashier-shifts/:id/close') @Roles(...COLLECTION_ROLES)
  closeShift(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: CloseCashierShiftDto) { return this.payments.closeShift(actor, id, body); }

  @Get('reports/collections') @Roles(...COLLECTION_ROLES)
  collectionReport(@CurrentUser() actor: Actor, @Query() query: CollectionReportDto) { return this.payments.collectionReport(actor, query); }

  @Get('reports/receipt-register') @Roles(...COLLECTION_ROLES)
  receiptRegister(@CurrentUser() actor: Actor, @Query() query: PaymentListDto) { return this.payments.register(actor, query); }
}
