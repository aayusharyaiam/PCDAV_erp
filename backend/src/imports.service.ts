import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Actor } from './auth';
import { audit, Db, Tx } from './db';
import { CsvImportDto } from './dto';
import { asDate } from './utils';
import { csvBoolean, csvInteger, csvValue, CsvRow, parseCsv } from './csv';
import { jsonSafe, minor } from './fee-utils';
import { randomUUID } from 'node:crypto';

type ImportKind = 'STUDENTS' | 'TRANSPORT_ROUTES' | 'TRANSPORT_VEHICLES' | 'TRANSPORT_ALLOCATIONS' | 'STORE_PRODUCTS' | 'STORE_VENDORS' | 'STORE_STOCK_OPENING';
type PreparedRow = { payload: Record<string, string>; error?: string };
type ImportClient = Db | Tx;

const kindAliases: Record<string, ImportKind> = {
  students: 'STUDENTS',
  student: 'STUDENTS',
  'transport/routes': 'TRANSPORT_ROUTES',
  routes: 'TRANSPORT_ROUTES',
  'transport-routes': 'TRANSPORT_ROUTES',
  'transport/vehicles': 'TRANSPORT_VEHICLES',
  vehicles: 'TRANSPORT_VEHICLES',
  'transport-vehicles': 'TRANSPORT_VEHICLES',
  'transport/allocations': 'TRANSPORT_ALLOCATIONS',
  allocations: 'TRANSPORT_ALLOCATIONS',
  'transport-allocations': 'TRANSPORT_ALLOCATIONS',
  'store/products': 'STORE_PRODUCTS',
  products: 'STORE_PRODUCTS',
  'store-products': 'STORE_PRODUCTS',
  'store/vendors': 'STORE_VENDORS',
  vendors: 'STORE_VENDORS',
  'store-vendors': 'STORE_VENDORS',
  'store/stock-opening': 'STORE_STOCK_OPENING',
  'stock-opening': 'STORE_STOCK_OPENING',
  'store-stock-opening': 'STORE_STOCK_OPENING',
};

function normaliseKind(value: string, resource?: string): ImportKind {
  const raw = resource ? `${value}/${resource}` : value;
  const alias = kindAliases[raw.toLowerCase()] ?? kindAliases[value.toLowerCase()];
  if (!alias) throw new BadRequestException('Unsupported import. Use students, transport/routes, transport/vehicles, transport/allocations, store/products, store/vendors, or store/stock-opening');
  return alias;
}

function errorMessage(error: unknown) {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    return typeof response === 'string' ? response : String((response as { message?: unknown }).message ?? error.message);
  }
  return error instanceof Error ? error.message : 'Invalid row';
}

function required(row: CsvRow, field: string, ...aliases: string[]) {
  const value = csvValue(row, field, ...aliases);
  if (!value) throw new BadRequestException(`${field} is required`);
  return value;
}

function csvDate(row: CsvRow, field: string, ...aliases: string[]) {
  const value = required(row, field, ...aliases);
  asDate(value);
  return value;
}

function dateOrEmpty(row: CsvRow, field: string, ...aliases: string[]) {
  const value = csvValue(row, field, ...aliases);
  if (value) asDate(value);
  return value;
}

function text(row: CsvRow, field: string, ...aliases: string[]) { return csvValue(row, field, ...aliases); }

function money(row: CsvRow, field: string, ...aliases: string[]) { return minor(required(row, field, ...aliases)).toString(); }

function phone(value: string, field: string) {
  if (value && !/^[+0-9 ()-]{7,25}$/.test(value)) throw new BadRequestException(`${field} is not a valid phone number`);
  return value;
}

function gender(value: string) {
  const upper = value.toUpperCase();
  if (upper === 'M' || upper === 'MALE') return 'BOY';
  if (upper === 'F' || upper === 'FEMALE') return 'GIRL';
  if (['BOY', 'GIRL', 'OTHER'].includes(upper)) return upper;
  throw new BadRequestException('gender must be BOY, GIRL, or OTHER');
}

function overlaps(start: Date, end: Date | undefined, otherStart: Date, otherEnd: Date | null) {
  return otherStart <= (end ?? new Date('9999-12-31')) && (!otherEnd || otherEnd >= start);
}

function receiptNumber() { return `SR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`; }

@Injectable()
export class ImportsService {
  constructor(private readonly db: Db) {}

  async preview(actor: Actor, value: string, resource: string | undefined, body: CsvImportDto) {
    const kind = normaliseKind(value, resource);
    const rows = parseCsv(body.csv ?? '');
    if (rows.length > 5000) throw new BadRequestException('A single import is limited to 5,000 rows');
    const prepared = await this.validate(kind, actor.schoolId, rows);
    const batch = await this.db.atomic(async tx => {
      const created = await tx.importBatch.create({ data: { schoolId: actor.schoolId, kind, sourceName: body.sourceName?.trim() ?? '', reason: body.reason.trim(), totalRows: prepared.length, validRows: prepared.filter(row => !row.error).length, invalidRows: prepared.filter(row => !!row.error).length, createdBy: actor.id } });
      await tx.importRow.createMany({ data: prepared.map((row, index) => ({ schoolId: actor.schoolId, batchId: created.id, rowNumber: index + 2, payload: row.payload as Prisma.InputJsonValue, status: row.error ? 'ERROR' : 'VALID', error: row.error })) });
      await audit(tx, actor, 'IMPORT_PREVIEWED', 'ImportBatch', created.id, body.reason, undefined, { batch: created, rowCount: prepared.length });
      return created;
    });
    return this.view(this.db, actor.schoolId, batch.id);
  }

  async commit(actor: Actor, batchId: string, reason: string) {
    return this.db.atomic(async tx => {
      const batch = await tx.importBatch.findFirst({ where: { id: batchId, schoolId: actor.schoolId } });
      if (!batch) throw new NotFoundException('Import batch not found');
      if (batch.status === 'COMMITTED') return this.view(tx, actor.schoolId, batch.id);
      if (batch.status !== 'PREVIEWED') throw new ConflictException('Import batch is not available for commit');
      if (batch.invalidRows > 0) throw new BadRequestException('Fix invalid rows and create a new preview before committing');
      const rows = await tx.importRow.findMany({ where: { batchId: batch.id, schoolId: actor.schoolId, status: 'VALID' }, orderBy: { rowNumber: 'asc' } });
      for (const row of rows) await this.commitRow(tx, actor, batch.kind as ImportKind, row.id, row.payload as Record<string, string>, reason);
      const committed = await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'COMMITTED', committedAt: new Date() } });
      await audit(tx, actor, 'IMPORT_COMMITTED', 'ImportBatch', batch.id, reason, batch, committed);
      return this.view(tx, actor.schoolId, batch.id);
    });
  }

  private async validate(kind: ImportKind, schoolId: string, rows: CsvRow[]): Promise<PreparedRow[]> {
    const prepared: PreparedRow[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      try {
        const payload = await this.validateRow(kind, schoolId, row, seen);
        prepared.push({ payload });
      } catch (error) {
        prepared.push({ payload: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value])), error: errorMessage(error) });
      }
    }
    return prepared;
  }

  private async validateRow(kind: ImportKind, schoolId: string, row: CsvRow, seen: Set<string>): Promise<Record<string, string>> {
    if (kind === 'STUDENTS') {
      const admissionNumber = text(row, 'admissionNumber', 'admissionNo').toUpperCase();
      if (admissionNumber) {
        if (seen.has(`admission:${admissionNumber}`)) throw new BadRequestException('admissionNumber is duplicated in this CSV');
        if (await this.db.student.findFirst({ where: { schoolId, admissionNumber } })) throw new ConflictException('admissionNumber already exists');
        seen.add(`admission:${admissionNumber}`);
      }
      const name = required(row, 'name', 'studentName');
      const dateOfBirth = csvDate(row, 'dateOfBirth', 'dob');
      const genderValue = gender(required(row, 'gender'));
      const admissionDate = csvDate(row, 'admissionDate');
      const sessionId = text(row, 'sessionId', 'academicSessionId');
      const classId = text(row, 'classId', 'classOfferingId');
      if (!!sessionId !== !!classId) throw new BadRequestException('sessionId and classId must be provided together');
      if (sessionId) {
        const session = await this.db.academicSession.findFirst({ where: { id: sessionId, schoolId } });
        const classroom = await this.db.classOffering.findFirst({ where: { id: classId, schoolId, sessionId } });
        if (!session || !classroom) throw new BadRequestException('sessionId and classId do not identify a classroom in the same school/session');
        const activeCount = await this.db.enrollment.count({ where: { schoolId, classId, status: 'ACTIVE' } });
        if (activeCount >= classroom.capacity) throw new ConflictException('classId is already at capacity');
        if (asDate(admissionDate) < session.startDate || asDate(admissionDate) > session.endDate) throw new BadRequestException('admissionDate must fall within the session');
      }
      const guardianName = text(row, 'guardianName');
      const guardianPhone = phone(text(row, 'guardianPhone', 'phone'), 'guardianPhone');
      if (!!guardianName !== !!guardianPhone) throw new BadRequestException('guardianName and guardianPhone must be provided together');
      return { admissionNumber, name, dateOfBirth, gender: genderValue, admissionDate, address: text(row, 'address'), permanentAddress: text(row, 'permanentAddress'), previousSchool: text(row, 'previousSchool'), guardianName, guardianPhone, guardianRelationship: text(row, 'guardianRelationship', 'relationship') || 'Guardian', guardianEmail: text(row, 'guardianEmail', 'email'), sessionId, classId, entryType: text(row, 'entryType') || 'NEW_ADMISSION', feeCategory: text(row, 'feeCategory') || 'GENERAL', ews: String(csvBoolean(text(row, 'ews'), 'ews')), };
    }
    if (kind === 'TRANSPORT_ROUTES') {
      const name = required(row, 'name', 'routeName');
      const unique = `route:${name.toLowerCase()}`;
      if (seen.has(unique) || await this.db.transportRoute.findFirst({ where: { schoolId, name } })) throw new ConflictException('route name already exists');
      seen.add(unique);
      const capacityValue = text(row, 'capacity'); if (capacityValue) csvInteger(capacityValue, 'capacity', 1);
      return { name, campus: text(row, 'campus'), destination: text(row, 'destination', 'stop'), monthlyAmountMinor: money(row, 'monthlyAmountMinor', 'monthlyAmount'), capacity: capacityValue };
    }
    if (kind === 'TRANSPORT_VEHICLES') {
      const busNumber = required(row, 'busNumber', 'vehicleNumber');
      const unique = `vehicle:${busNumber.toLowerCase()}`;
      if (seen.has(unique) || await this.db.transportVehicle.findFirst({ where: { schoolId, busNumber } })) throw new ConflictException('busNumber already exists');
      seen.add(unique);
      return { name: required(row, 'name', 'vehicleName'), busNumber, capacity: String(csvInteger(required(row, 'capacity'), 'capacity', 1)), driver1Name: text(row, 'driver1Name'), driver1Phone: phone(text(row, 'driver1Phone'), 'driver1Phone'), driver2Name: text(row, 'driver2Name'), driver2Phone: phone(text(row, 'driver2Phone'), 'driver2Phone') };
    }
    if (kind === 'TRANSPORT_ALLOCATIONS') {
      const enrollmentId = text(row, 'enrollmentId'); const admissionNumber = text(row, 'admissionNumber', 'admissionNo').toUpperCase();
      if (!enrollmentId && !admissionNumber) throw new BadRequestException('enrollmentId or admissionNumber is required');
      const startDate = csvDate(row, 'startDate'); const endDate = dateOrEmpty(row, 'endDate');
      if (endDate && asDate(endDate) < asDate(startDate)) throw new BadRequestException('endDate must not be before startDate');
      let enrollment = enrollmentId ? await this.db.enrollment.findFirst({ where: { id: enrollmentId, schoolId, status: 'ACTIVE' } }) : null;
      if (!enrollment && admissionNumber) {
        const student = await this.db.student.findFirst({ where: { schoolId, admissionNumber } });
        enrollment = student ? await this.db.enrollment.findFirst({ where: { schoolId, studentId: student.id, status: 'ACTIVE' }, orderBy: { startDate: 'desc' } }) : null;
      }
      if (!enrollment) throw new BadRequestException('Active enrollment was not found');
      const routeId = text(row, 'routeId'); const routeName = text(row, 'routeName');
      const route = routeId ? await this.db.transportRoute.findFirst({ where: { id: routeId, schoolId, active: true } }) : await this.db.transportRoute.findFirst({ where: { schoolId, name: routeName, active: true } });
      if (!route) throw new BadRequestException('Active route was not found');
      const vehicleId = text(row, 'vehicleId'); const busNumber = text(row, 'busNumber', 'vehicleNumber');
      const vehicle = vehicleId ? await this.db.transportVehicle.findFirst({ where: { id: vehicleId, schoolId, active: true } }) : busNumber ? await this.db.transportVehicle.findFirst({ where: { schoolId, busNumber, active: true } }) : null;
      if (vehicleId || busNumber) if (!vehicle) throw new BadRequestException('Active vehicle was not found');
      if (asDate(startDate) < enrollment.startDate || (enrollment.endDate && asDate(startDate) > enrollment.endDate)) throw new BadRequestException('Allocation dates must fall within the enrollment');
      return { enrollmentId: enrollment.id, routeId: route.id, vehicleId: vehicle?.id ?? '', startDate, endDate };
    }
    if (kind === 'STORE_VENDORS') {
      const name = required(row, 'name', 'vendorName');
      const unique = `vendor:${name.toLowerCase()}`;
      if (seen.has(unique) || await this.db.storeVendor.findFirst({ where: { schoolId, name } })) throw new ConflictException('vendor name already exists');
      seen.add(unique);
      return { name, address: text(row, 'address'), phone: phone(text(row, 'phone'), 'phone'), email: text(row, 'email'), contactName: text(row, 'contactName'), contactAddress: text(row, 'contactAddress'), contactPhone: phone(text(row, 'contactPhone'), 'contactPhone'), bankAccount: text(row, 'bankAccount'), bankName: text(row, 'bankName'), ifsc: text(row, 'ifsc').toUpperCase(), upi: text(row, 'upi') };
    }
    if (kind === 'STORE_PRODUCTS') {
      const name = required(row, 'name', 'productName');
      const unique = `product:${name.toLowerCase()}`;
      if (seen.has(unique) || await this.db.storeProduct.findFirst({ where: { schoolId, name } })) throw new ConflictException('product name already exists');
      seen.add(unique);
      const groupId = text(row, 'groupId'); const groupCode = text(row, 'groupCode');
      if (groupId && !await this.db.storeGroup.findFirst({ where: { id: groupId, schoolId, active: true } })) throw new BadRequestException('groupId was not found');
      if (groupCode && !await this.db.storeGroup.findFirst({ where: { schoolId, code: groupCode.toUpperCase(), active: true } })) throw new BadRequestException('groupCode was not found');
      return { name, description: text(row, 'description'), groupId, groupCode: groupCode.toUpperCase(), unitCostMinor: money(row, 'unitCostMinor', 'unitCost'), alertQuantity: String(csvInteger(text(row, 'alertQuantity') || '0', 'alertQuantity', 0)) };
    }
    const productId = text(row, 'productId'); const productName = text(row, 'productName');
    if (!productId && !productName) throw new BadRequestException('productId or productName is required');
    const product = productId ? await this.db.storeProduct.findFirst({ where: { id: productId, schoolId, active: true } }) : await this.db.storeProduct.findFirst({ where: { schoolId, name: productName, active: true } });
    if (!product) throw new BadRequestException('Active store product was not found');
    return { productId: product.id, quantity: String(csvInteger(required(row, 'quantity', 'openingQuantity'), 'quantity', 1)), unitCostMinor: money(row, 'unitCostMinor', 'unitCost'), receivedAt: csvDate(row, 'receivedAt', 'openingDate'), vendorId: text(row, 'vendorId'), vendorName: text(row, 'vendorName') };
  }

  private async commitRow(tx: Tx, actor: Actor, kind: ImportKind, rowId: string, payload: Record<string, string>, reason: string) {
    let entityType = ''; let entityId = '';
    if (kind === 'STUDENTS') {
      const school = await tx.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
      let admissionNumber = payload.admissionNumber;
      if (!admissionNumber) {
        let next = school.nextAdmission;
        do { admissionNumber = `${school.admissionPrefix}-${String(next).padStart(4, '0')}`; next += 1; } while (await tx.student.findFirst({ where: { schoolId: actor.schoolId, admissionNumber } }));
        await tx.school.update({ where: { id: school.id }, data: { nextAdmission: next } });
      }
      const family = await tx.family.create({ data: { schoolId: actor.schoolId, label: `${payload.name} family` } });
      if (payload.guardianName && payload.guardianPhone) await tx.guardian.create({ data: { schoolId: actor.schoolId, familyId: family.id, name: payload.guardianName, relationship: payload.guardianRelationship, phone: payload.guardianPhone, email: payload.guardianEmail, address: payload.address } });
      const student = await tx.student.create({ data: { schoolId: actor.schoolId, admissionNumber, name: payload.name, dateOfBirth: asDate(payload.dateOfBirth), gender: payload.gender, familyId: family.id, admissionDate: asDate(payload.admissionDate), address: payload.address, permanentAddress: payload.permanentAddress, previousSchool: payload.previousSchool } });
      entityType = 'Student'; entityId = student.id;
      if (payload.sessionId) {
        const classroom = await tx.classOffering.findFirstOrThrow({ where: { id: payload.classId, schoolId: actor.schoolId, sessionId: payload.sessionId } });
        const count = await tx.enrollment.count({ where: { schoolId: actor.schoolId, classId: classroom.id, status: 'ACTIVE' } });
        if (count >= classroom.capacity) throw new ConflictException('Class capacity changed after preview');
        await tx.enrollment.create({ data: { schoolId: actor.schoolId, studentId: student.id, sessionId: payload.sessionId, classId: classroom.id, status: 'ACTIVE', entryType: payload.entryType, feeCategory: payload.feeCategory, ews: payload.ews === 'true', startDate: asDate(payload.admissionDate) } });
      }
      await audit(tx, actor, 'STUDENT_IMPORTED', 'Student', student.id, reason, undefined, { student, admissionNumber });
    } else if (kind === 'TRANSPORT_ROUTES') {
      const route = await tx.transportRoute.create({ data: { schoolId: actor.schoolId, name: payload.name, campus: payload.campus, destination: payload.destination, monthlyAmountMinor: BigInt(payload.monthlyAmountMinor), capacity: payload.capacity ? Number(payload.capacity) : undefined } });
      entityType = 'TransportRoute'; entityId = route.id;
      await audit(tx, actor, 'TRANSPORT_ROUTE_IMPORTED', entityType, entityId, reason, undefined, route);
    } else if (kind === 'TRANSPORT_VEHICLES') {
      const vehicle = await tx.transportVehicle.create({ data: { schoolId: actor.schoolId, name: payload.name, busNumber: payload.busNumber, capacity: Number(payload.capacity), driver1Name: payload.driver1Name, driver1Phone: payload.driver1Phone, driver2Name: payload.driver2Name, driver2Phone: payload.driver2Phone } });
      entityType = 'TransportVehicle'; entityId = vehicle.id;
      await audit(tx, actor, 'TRANSPORT_VEHICLE_IMPORTED', entityType, entityId, reason, undefined, vehicle);
    } else if (kind === 'TRANSPORT_ALLOCATIONS') {
      const enrollment = await tx.enrollment.findFirstOrThrow({ where: { id: payload.enrollmentId, schoolId: actor.schoolId, status: 'ACTIVE' } });
      const route = await tx.transportRoute.findFirstOrThrow({ where: { id: payload.routeId, schoolId: actor.schoolId, active: true } });
      const vehicle = payload.vehicleId ? await tx.transportVehicle.findFirstOrThrow({ where: { id: payload.vehicleId, schoolId: actor.schoolId, active: true } }) : null;
      const start = asDate(payload.startDate); const end = payload.endDate ? asDate(payload.endDate) : undefined;
      const sameStudent = await tx.serviceAssignment.findFirst({ where: { schoolId: actor.schoolId, enrollmentId: enrollment.id, type: 'TRANSPORT', startDate: { lte: end ?? new Date('9999-12-31') }, OR: [{ endDate: null }, { endDate: { gte: start } }] } });
      if (sameStudent) throw new ConflictException('Student already has an overlapping transport allocation');
      const candidates = await tx.serviceAssignment.findMany({ where: { schoolId: actor.schoolId, type: 'TRANSPORT', active: true, OR: [{ routeId: route.id }, ...(vehicle ? [{ vehicleId: vehicle.id }] : [])] } });
      if (route.capacity && candidates.filter(item => item.routeId === route.id && overlaps(start, end, item.startDate, item.endDate)).length >= route.capacity) throw new ConflictException('Route capacity changed after preview');
      if (vehicle && candidates.filter(item => item.vehicleId === vehicle.id && overlaps(start, end, item.startDate, item.endDate)).length >= vehicle.capacity) throw new ConflictException('Vehicle capacity changed after preview');
      const allocation = await tx.serviceAssignment.create({ data: { schoolId: actor.schoolId, enrollmentId: enrollment.id, type: 'TRANSPORT', label: route.name, amountMinor: route.monthlyAmountMinor, frequency: 'MONTHLY', startDate: start, endDate: end, routeId: route.id, vehicleId: vehicle?.id, assignedBy: actor.id } });
      entityType = 'ServiceAssignment'; entityId = allocation.id;
      await audit(tx, actor, 'TRANSPORT_ALLOCATION_IMPORTED', entityType, entityId, reason, undefined, allocation);
    } else if (kind === 'STORE_VENDORS') {
      const vendor = await tx.storeVendor.create({ data: { schoolId: actor.schoolId, name: payload.name, address: payload.address, phone: payload.phone, email: payload.email, contactName: payload.contactName, contactAddress: payload.contactAddress, contactPhone: payload.contactPhone, bankAccount: payload.bankAccount, bankName: payload.bankName, ifsc: payload.ifsc, upi: payload.upi } });
      entityType = 'StoreVendor'; entityId = vendor.id;
      await audit(tx, actor, 'STORE_VENDOR_IMPORTED', entityType, entityId, reason, undefined, vendor);
    } else if (kind === 'STORE_PRODUCTS') {
      const group = payload.groupId ? await tx.storeGroup.findFirst({ where: { id: payload.groupId, schoolId: actor.schoolId, active: true } }) : payload.groupCode ? await tx.storeGroup.findFirst({ where: { schoolId: actor.schoolId, code: payload.groupCode, active: true } }) : null;
      const product = await tx.storeProduct.create({ data: { schoolId: actor.schoolId, name: payload.name, description: payload.description, groupId: group?.id, unitCostMinor: BigInt(payload.unitCostMinor), alertQuantity: Number(payload.alertQuantity) } });
      entityType = 'StoreProduct'; entityId = product.id;
      await audit(tx, actor, 'STORE_PRODUCT_IMPORTED', entityType, entityId, reason, undefined, product);
    } else {
      const product = await tx.storeProduct.findFirstOrThrow({ where: { id: payload.productId, schoolId: actor.schoolId, active: true } });
      const vendor = payload.vendorId ? await tx.storeVendor.findFirst({ where: { id: payload.vendorId, schoolId: actor.schoolId, active: true } }) : payload.vendorName ? await tx.storeVendor.findFirst({ where: { schoolId: actor.schoolId, name: payload.vendorName, active: true } }) : null;
      if ((payload.vendorId || payload.vendorName) && !vendor) throw new BadRequestException('Opening stock vendor was not found');
      const quantity = Number(payload.quantity); const unitCost = BigInt(payload.unitCostMinor); const total = unitCost * BigInt(quantity);
      const receipt = await tx.storeStockReceipt.create({ data: { schoolId: actor.schoolId, receiptNumber: receiptNumber(), vendorId: vendor?.id, receivedAt: asDate(payload.receivedAt), totalMinor: total, reason, createdBy: actor.id } });
      await tx.storeStockReceiptLine.create({ data: { schoolId: actor.schoolId, receiptId: receipt.id, productId: product.id, quantity, unitCostMinor: unitCost, totalMinor: total } });
      await tx.storeProduct.update({ where: { id: product.id }, data: { quantity: { increment: quantity }, unitCostMinor: unitCost } });
      await tx.storeStockMovement.create({ data: { schoolId: actor.schoolId, productId: product.id, type: 'OPENING_BALANCE', quantityDelta: quantity, unitCostMinor: unitCost, sourceType: 'IMPORT_BATCH', sourceId: receipt.id, reason, actorId: actor.id } });
      entityType = 'StoreStockReceipt'; entityId = receipt.id;
      await audit(tx, actor, 'STORE_OPENING_STOCK_IMPORTED', entityType, entityId, reason, undefined, { receipt, productId: product.id, quantity });
    }
    await tx.importRow.update({ where: { id: rowId }, data: { status: 'IMPORTED', entityType, entityId } });
  }

  private async view(client: ImportClient, schoolId: string, batchId: string) {
    const batch = await client.importBatch.findFirst({ where: { id: batchId, schoolId } });
    if (!batch) throw new NotFoundException('Import batch not found');
    const rows = await client.importRow.findMany({ where: { batchId, schoolId }, orderBy: { rowNumber: 'asc' } });
    return jsonSafe({ batch, rows, summary: { totalRows: batch.totalRows, validRows: batch.validRows, invalidRows: batch.invalidRows, importedRows: rows.filter(row => row.status === 'IMPORTED').length } });
  }
}

export { normaliseKind };
