import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Actor } from './auth';
import { Tx } from './db';

export function stable(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value as object).filter(key => (value as any)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stable((value as any)[key])}`).join(',')}}`;
}
export const fingerprint = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
export function requireCommandKey(key?: string): asserts key is string {
  if (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new BadRequestException('A valid Idempotency-Key header is required');
}
export function requireAdmin(actor: Actor) {
  if (!['ADMIN', 'SUPERADMIN'].includes(actor.role)) throw new ForbiddenException('Admin approval is required');
}
export async function financialDate(tx: Tx, date: Date) {
  await tx.$queryRaw`SELECT set_config('app.finance_date', ${date.toISOString().slice(0, 10)}, true)`;
}
