import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { Db } from '../src/db';
import { ApiErrors } from '../src/errors';
import { tokenHash } from '../src/auth';
import { cleanupTestSchool } from './finance-cleanup';

describe('Student lifecycle, operational imports and reports', () => {
  let app: INestApplication;
  let db: Db;
  let schoolId: string;
  let sourceSessionId: string;
  let targetSessionId: string;
  let transferSessionId: string;
  let sourceClassId: string;
  let targetClassId: string;
  let transferClassId: string;
  let admin: { cookie: string; csrf: string };
  let studentId: string;
  let enrollmentId: string;
  const suffix = randomUUID().slice(0, 8);
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

  const client = (method: 'get' | 'post', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', admin.cookie).set('Origin', origin).set('X-CSRF-Token', admin.csrf);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a disposable test database');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser()); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); app.useGlobalFilters(new ApiErrors());
    await app.init(); db = app.get(Db);
    schoolId = (await db.school.create({ data: { name: `Lifecycle import ${suffix}`, admissionPrefix: `IMP${suffix.slice(0, 3).toUpperCase()}` } })).id;
    const source = await db.academicSession.create({ data: { schoolId, name: `Source ${suffix}`, startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), current: true, admissionsOpen: true } });
    const target = await db.academicSession.create({ data: { schoolId, name: `Target ${suffix}`, startDate: new Date('2027-04-01'), endDate: new Date('2028-03-31'), admissionsOpen: true } });
    const transfer = await db.academicSession.create({ data: { schoolId, name: `Transfer ${suffix}`, startDate: new Date('2028-04-01'), endDate: new Date('2029-03-31'), admissionsOpen: true } });
    sourceSessionId = source.id; targetSessionId = target.id; transferSessionId = transfer.id;
    sourceClassId = (await db.classOffering.create({ data: { schoolId, sessionId: source.id, grade: 'VI', section: 'A', capacity: 20 } })).id;
    targetClassId = (await db.classOffering.create({ data: { schoolId, sessionId: target.id, grade: 'VII', section: 'A', capacity: 20 } })).id;
    transferClassId = (await db.classOffering.create({ data: { schoolId, sessionId: transfer.id, grade: 'VIII', section: 'A', capacity: 20 } })).id;
    const user = await db.user.create({ data: { schoolId, role: Role.ADMIN, name: 'Lifecycle import admin', email: `${suffix}@example.test`, passwordHash: 'fixture', mustChangePassword: false } });
    const token = randomUUID(); const csrf = randomUUID();
    await db.loginSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), csrfToken: csrf, expiresAt: new Date(Date.now() + 3600000) } });
    admin = { cookie: `pcdav_session=${token}`, csrf };
    const family = await db.family.create({ data: { schoolId, label: 'Lifecycle family' } });
    const student = await db.student.create({ data: { schoolId, familyId: family.id, admissionNumber: `EXISTING-${suffix}`, name: 'Existing Student', dateOfBirth: new Date('2014-01-01'), gender: 'BOY', admissionDate: new Date('2026-04-01') } });
    studentId = student.id;
    enrollmentId = (await db.enrollment.create({ data: { schoolId, studentId, sessionId: source.id, classId: sourceClassId, startDate: source.startDate } })).id;
  });

  afterAll(async () => { if (db && schoolId) await cleanupTestSchool(db, schoolId); await app?.close(); });

  it('withdraws with dated history and readmits the same permanent identity', async () => {
    const withdrawn = await client('post', `/students/${studentId}/withdraw`).send({ enrollmentId, effectiveDate: '2026-10-20', version: 1, reason: 'Family relocation recorded by office' }).expect(201);
    expect(withdrawn.body.student.id).toBe(studentId);
    expect(withdrawn.body.student.status).toBe('FORMER');
    expect(withdrawn.body.enrollment.status).toBe('WITHDRAWN');
    expect(withdrawn.body.event.eventType).toBe('WITHDRAWN');
    const readmitted = await client('post', `/students/${studentId}/readmit`).send({ targetSessionId, targetClassId, startDate: '2027-04-01', reason: 'Approved return to school' }).expect(201);
    expect(readmitted.body.student.id).toBe(studentId);
    expect(readmitted.body.enrollment.entryType).toBe('READMISSION');
    expect(readmitted.body.student.admissionNumber).toBe(`EXISTING-${suffix}`);
    const transferred = await client('post', `/students/${studentId}/transfer`).send({ sourceEnrollmentId: readmitted.body.enrollment.id, targetSessionId: transferSessionId, targetClassId: transferClassId, startDate: '2028-04-01', reason: 'Synthetic session transfer' }).expect(201);
    expect(transferred.body.student.id).toBe(studentId);
    expect(transferred.body.enrollment.entryType).toBe('TRANSFER');
    expect(transferred.body.sourceEnrollment.status).toBe('TRANSFERRED');
    const history = await client('get', `/students/${studentId}/lifecycle`).expect(200);
    expect(history.body.map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining(['WITHDRAWN', 'READMITTED']));
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status).toBe('WITHDRAWN');
  });

  it('previews and commits synthetic CSVs for students, transport and store operations', async () => {
    const studentCsv = ['admissionNumber,name,dateOfBirth,gender,admissionDate,guardianName,guardianPhone,sessionId,classId', `IMPORTED-${suffix},Imported Student,2015-02-03,GIRL,2027-04-01,Imported Guardian,9222222222,${targetSessionId},${targetClassId}`].join('\n');
    const studentPreview = await client('post', '/imports/students/preview').send({ csv: studentCsv, reason: 'Synthetic student migration review' }).expect(201);
    expect(studentPreview.body.batch.validRows).toBe(1);
    await client('post', '/imports/students/commit').send({ batchId: studentPreview.body.batch.id, reason: 'Commit synthetic students' }).expect(201);
    const imported = await db.student.findFirstOrThrow({ where: { schoolId, admissionNumber: `IMPORTED-${suffix}`.toUpperCase() } });
    const importedEnrollment = await db.enrollment.findUniqueOrThrow({ where: { schoolId_studentId_sessionId: { schoolId, studentId: imported.id, sessionId: targetSessionId } } });

    const routePreview = await client('post', '/imports/transport/routes/preview').send({ csv: 'name,campus,destination,monthlyAmountMinor,capacity\nImported Route,Main,North,180000,10', reason: 'Synthetic route review' }).expect(201);
    await client('post', '/imports/transport/routes/commit').send({ batchId: routePreview.body.batch.id, reason: 'Commit synthetic route' }).expect(201);
    const route = await db.transportRoute.findFirstOrThrow({ where: { schoolId, name: 'Imported Route' } });
    const vehiclePreview = await client('post', '/imports/transport/vehicles/preview').send({ csv: 'name,busNumber,capacity,driver1Name,driver1Phone\nImported Bus,BUS-IMP,10,Driver,9111111111', reason: 'Synthetic vehicle review' }).expect(201);
    await client('post', '/imports/transport/vehicles/commit').send({ batchId: vehiclePreview.body.batch.id, reason: 'Commit synthetic vehicle' }).expect(201);
    const vehicle = await db.transportVehicle.findFirstOrThrow({ where: { schoolId, busNumber: 'BUS-IMP' } });
    const allocationPreview = await client('post', '/imports/transport/allocations/preview').send({ csv: `enrollmentId,routeId,vehicleId,startDate\n${importedEnrollment.id},${route.id},${vehicle.id},2027-04-01`, reason: 'Synthetic allocation review' }).expect(201);
    await client('post', '/imports/transport/allocations/commit').send({ batchId: allocationPreview.body.batch.id, reason: 'Commit synthetic allocation' }).expect(201);

    const vendorPreview = await client('post', '/imports/store/vendors/preview').send({ csv: 'name,phone\nImported Vendor,9333333333', reason: 'Synthetic vendor review' }).expect(201);
    await client('post', '/imports/store/vendors/commit').send({ batchId: vendorPreview.body.batch.id, reason: 'Commit synthetic vendor' }).expect(201);
    const vendor = await db.storeVendor.findFirstOrThrow({ where: { schoolId, name: 'Imported Vendor' } });
    const productPreview = await client('post', '/imports/store/products/preview').send({ csv: 'name,unitCostMinor,alertQuantity\nImported Diary,12500,1', reason: 'Synthetic product review' }).expect(201);
    await client('post', '/imports/store/products/commit').send({ batchId: productPreview.body.batch.id, reason: 'Commit synthetic product' }).expect(201);
    const product = await db.storeProduct.findFirstOrThrow({ where: { schoolId, name: 'Imported Diary' } });
    const openingPreview = await client('post', '/imports/store/stock-opening/preview').send({ csv: `productId,quantity,unitCostMinor,receivedAt,vendorId\n${product.id},4,12500,2027-04-01,${vendor.id}`, reason: 'Synthetic opening stock review' }).expect(201);
    await client('post', '/imports/store/stock-opening/commit').send({ batchId: openingPreview.body.batch.id, reason: 'Commit synthetic opening stock' }).expect(201);
    expect((await db.storeProduct.findUniqueOrThrow({ where: { id: product.id } })).quantity).toBe(4);

    await client('get', `/reports/enrollments?sessionId=${targetSessionId}`).expect(200).expect(response => expect(response.body.items.some((item: { student?: { id: string } }) => item.student?.id === imported.id)).toBe(true));
    await client('get', `/reports/admissions?sessionId=${targetSessionId}`).expect(200).expect(response => expect(response.body.denominator).toBe('applications'));
    await client('get', '/reports/operational?area=TRANSPORT').expect(200).expect(response => expect(response.body.total).toBeGreaterThanOrEqual(1));
    await client('get', '/reports/store').expect(200).expect(response => expect(response.body.items.some((item: { id: string }) => item.id === product.id)).toBe(true));
    const importedCurrent = await db.student.findUniqueOrThrow({ where: { id: imported.id } });
    await client('post', `/students/${imported.id}/strike-off`).send({ enrollmentId: importedEnrollment.id, effectiveDate: '2027-09-01', version: importedCurrent.version, reason: 'Synthetic administrative strike-off' }).expect(201).expect(response => expect(response.body.student.status).toBe('FORMER'));
  });
});
