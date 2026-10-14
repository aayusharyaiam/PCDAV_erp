import { Body, Controller, Get, Header, HttpCode, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { Response } from 'express';
import { Actor, CurrentUser, Roles } from './auth';
import { RECEIPT_PDF_ROLES, ReceiptPdfService } from './receipt-pdf.service';

export class ReceiptPdfRetryDto {
  @IsString() @Length(3, 500) @Matches(/\S.*\S.*\S/s, { message: 'A meaningful retry reason is required' }) reason!: string;
}

// Uses the application's existing global AuthGuard (session, role, CSRF, origin).
@Controller('receipts')
@Roles(...RECEIPT_PDF_ROLES)
export class ReceiptPdfController {
  constructor(private readonly pdf: ReceiptPdfService) {}

  @Get(':id/pdf/status')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  status(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.pdf.status(actor, id); }

  @Post(':id/pdf/retry')
  @HttpCode(202)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  retry(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: ReceiptPdfRetryDto) {
    return this.pdf.retry(actor, id, body.reason);
  }

  @Get(':id/pdf')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@CurrentUser() actor: Actor, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Retry-After', '5');
    const result = await this.pdf.download(actor, id);
    response.removeHeader('Retry-After');
    return new StreamableFile(result.content, {
      type: 'application/pdf', disposition: `attachment; filename="${result.filename}"`, length: result.content.length,
    });
  }
}
