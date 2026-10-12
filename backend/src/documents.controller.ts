import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Response } from 'express';
import { AdminOnly, Actor, CurrentUser } from './auth';
import { Db, audit } from './db';
import { DocumentDto } from './dto';

@Injectable()
export class Storage {
  private s3 = process.env.STORAGE_DRIVER === 's3' ? new S3Client({ region: process.env.S3_REGION || 'auto', endpoint: process.env.S3_ENDPOINT }) : null;
  private folder = resolve(process.env.UPLOAD_DIR || './uploads');
  constructor() {
    if (process.env.NODE_ENV === 'production' && !this.s3) throw new Error('Production requires private S3 document storage');
    if (this.s3 && !process.env.S3_BUCKET) throw new Error('S3_BUCKET is required');
  }
  async put(key: string, buffer: Buffer, mime: string) {
    if (this.s3) await this.s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: mime }));
    else { await mkdir(this.folder, { recursive: true }); await writeFile(resolve(this.folder, key), buffer, { flag: 'wx' }); }
  }
  async get(key: string) {
    if (this.s3) { const result = await this.s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); return Buffer.from(await result.Body!.transformToByteArray()); }
    return readFile(resolve(this.folder, key));
  }
  async remove(key: string) {
    if (this.s3) await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    else await unlink(resolve(this.folder, key));
  }
}

@Controller('documents') @AdminOnly()
export class DocumentsController {
  constructor(private readonly db: Db, private readonly storage: Storage) {}
  @Get()
  async list(@CurrentUser() actor: Actor, @Query('applicationId') applicationId?: string, @Query('studentId') studentId?: string) {
    if (!applicationId && !studentId) throw new BadRequestException('Choose a student or application');
    return this.db.document.findMany({ where: { schoolId: actor.schoolId, ...(applicationId ? { applicationId } : { studentId }) }, select: { id: true, type: true, originalName: true, verifiedAt: true, createdAt: true, size: true } });
  }
  @Post() @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async upload(@CurrentUser() actor: Actor, @Body() body: DocumentDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file || (!!body.studentId === !!body.applicationId)) throw new BadRequestException('Upload one file for one student or application');
    const signature = file.buffer;
    const mime = signature.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : signature[0] === 255 && signature[1] === 216 && signature[2] === 255 ? 'image/jpeg' : '';
    if (!mime || mime !== file.mimetype) throw new BadRequestException('Only PDF, PNG, or JPEG with matching file content is accepted');
    let studentId = body.studentId;
    if (body.applicationId) {
      const application = await this.db.application.findFirst({ where: { schoolId: actor.schoolId, id: body.applicationId } });
      if (!application) throw new NotFoundException('Application not found');
      studentId = application.studentId ?? undefined;
    } else if (!await this.db.student.findFirst({ where: { schoolId: actor.schoolId, id: studentId } })) throw new NotFoundException('Student not found');
    const storageKey = randomUUID();
    await this.storage.put(storageKey, file.buffer, mime);
    try {
      return await this.db.atomic(async tx => {
        const document = await tx.document.create({ data: { schoolId: actor.schoolId, studentId, applicationId: body.applicationId, type: body.type, originalName: file.originalname.replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 150), storageKey, mimeType: mime, size: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex'), uploadedBy: actor.id } });
        await audit(tx, actor, 'DOCUMENT_UPLOADED', studentId ? 'Student' : 'Application', studentId || body.applicationId!, 'Document uploaded', undefined, { id: document.id, type: document.type, sha256: document.sha256 });
        return { id: document.id, originalName: document.originalName, type: document.type };
      });
    } catch (error) { await this.storage.remove(storageKey); throw error; }
  }
  @Get(':id/download')
  async download(@CurrentUser() actor: Actor, @Param('id') id: string, @Res() res: Response) {
    const doc = await this.db.document.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!doc) throw new NotFoundException('Document not found');
    res.setHeader('Content-Disposition', `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
    res.setHeader('Content-Type', doc.mimeType);
    res.send(await this.storage.get(doc.storageKey));
  }
  @Post(':id/verify')
  async verify(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.db.atomic(async tx => {
      const doc = await tx.document.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!doc) throw new NotFoundException('Document not found');
      await tx.document.update({ where: { id }, data: { verifiedAt: new Date(), verifiedBy: actor.id } });
      await audit(tx, actor, 'DOCUMENT_VERIFIED', doc.studentId ? 'Student' : 'Application', doc.studentId || doc.applicationId!, 'Document verified', undefined, { documentId: id });
      return { ok: true };
    });
  }
}
