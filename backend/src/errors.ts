import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const requestId = randomUUID();
    let status = 500; let message: unknown = 'Unexpected server error';
    if (error instanceof HttpException) { status = error.getStatus(); const body = error.getResponse(); message = typeof body === 'string' ? body : (body as { message?: unknown }).message; }
    else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002', 'P2034'].includes(error.code)) { status = 409; message = 'Duplicate record or concurrent change. Reload and check existing records.'; }
      else if (error.code === 'P2025') { status = 409; message = 'Record changed or no longer exists. Reload before saving.'; }
      else if (['P2003', 'P2004'].includes(error.code)) { status = 400; message = 'Invalid record relationship or business constraint.'; }
    }
    if (status === 500) Logger.error(`${requestId}: ${error instanceof Error ? error.name : 'UnknownError'}`);
    response.status(status).json({ statusCode: status, message, requestId });
  }
}
