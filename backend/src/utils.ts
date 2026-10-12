import { BadRequestException } from '@nestjs/common';

export const asDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Use YYYY-MM-DD');
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new BadRequestException('Use a valid calendar date');
  return result;
};
export const dateOnly = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
export const page = (pageNumber: number, limit: number) => ({ skip: (pageNumber - 1) * limit, take: limit });
