import { BadRequestException } from '@nestjs/common';

export type CsvRow = Record<string, string>;

function key(value: string) {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseCsv(csv: string): CsvRow[] {
  if (!csv || !csv.trim()) throw new BadRequestException('CSV content is required');
  const records: string[][] = [];
  let record: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"' && value.length === 0) quoted = true;
    else if (character === ',') { record.push(value.trim()); value = ''; }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      record.push(value.trim()); value = '';
      if (record.some(item => item.length > 0)) records.push(record);
      record = [];
    } else value += character;
  }
  if (quoted) throw new BadRequestException('CSV contains an unterminated quoted field');
  if (value.length > 0 || record.length > 0) { record.push(value.trim()); if (record.some(item => item.length > 0)) records.push(record); }
  if (records.length < 2) throw new BadRequestException('CSV must contain a header and at least one data row');
  const headers = records[0].map(key);
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) throw new BadRequestException('CSV headers must be non-empty and unique');
  return records.slice(1).map(fields => Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ''])));
}

export function csvValue(row: CsvRow, ...names: string[]) {
  for (const name of names) {
    const value = row[key(name)];
    if (value !== undefined && value.trim() !== '') return value.trim();
  }
  return '';
}

export function csvBoolean(value: string, field: string, defaultValue = false) {
  if (!value) return defaultValue;
  if (['true', '1', 'yes', 'y'].includes(value.toLowerCase())) return true;
  if (['false', '0', 'no', 'n'].includes(value.toLowerCase())) return false;
  throw new BadRequestException(`${field} must be true or false`);
}

export function csvInteger(value: string, field: string, minimum = 0) {
  if (!/^\d+$/.test(value)) throw new BadRequestException(`${field} must be a whole number`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) throw new BadRequestException(`${field} is outside the supported range`);
  return result;
}
