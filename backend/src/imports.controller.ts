import { BadRequestException, Body, Controller, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminOnly, Actor, CurrentUser } from './auth';
import { CsvImportDto, ImportCommitDto } from './dto';
import { ImportsService } from './imports.service';

function csvContent(body: CsvImportDto, file?: Express.Multer.File) {
  const content = file?.buffer.toString('utf8') ?? body.csv;
  if (!content) throw new BadRequestException('CSV content is required');
  return content;
}

@Controller('imports')
@AdminOnly()
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post(':kind/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  preview(@CurrentUser() actor: Actor, @Param('kind') kind: string, @Body() body: CsvImportDto, @UploadedFile() file?: Express.Multer.File) {
    return this.imports.preview(actor, kind, undefined, { ...body, csv: csvContent(body, file) });
  }

  @Post(':domain/:resource/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  previewScoped(@CurrentUser() actor: Actor, @Param('domain') domain: string, @Param('resource') resource: string, @Body() body: CsvImportDto, @UploadedFile() file?: Express.Multer.File) {
    return this.imports.preview(actor, domain, resource, { ...body, csv: csvContent(body, file) });
  }

  @Post(':kind/commit')
  commit(@CurrentUser() actor: Actor, @Param('kind') _kind: string, @Body() body: ImportCommitDto) { return this.imports.commit(actor, body.batchId, body.reason); }

  @Post(':domain/:resource/commit')
  commitScoped(@CurrentUser() actor: Actor, @Param('domain') _domain: string, @Param('resource') _resource: string, @Body() body: ImportCommitDto) { return this.imports.commit(actor, body.batchId, body.reason); }

  // A one-step endpoint is useful for synthetic fixtures. It still creates
  // and validates the preview batch first; dryRun=true (the DTO default)
  // returns the preview without writing target records.
  @Post(':kind')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async oneStep(@CurrentUser() actor: Actor, @Param('kind') kind: string, @Body() body: CsvImportDto, @UploadedFile() file?: Express.Multer.File) {
    const preview = await this.imports.preview(actor, kind, undefined, { ...body, csv: csvContent(body, file) });
    return body.dryRun === false ? this.imports.commit(actor, preview.batch.id, body.reason) : preview;
  }

  @Post(':domain/:resource')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async oneStepScoped(@CurrentUser() actor: Actor, @Param('domain') domain: string, @Param('resource') resource: string, @Body() body: CsvImportDto, @UploadedFile() file?: Express.Multer.File) {
    const preview = await this.imports.preview(actor, domain, resource, { ...body, csv: csvContent(body, file) });
    return body.dryRun === false ? this.imports.commit(actor, preview.batch.id, body.reason) : preview;
  }
}
