import 'dotenv/config';
import * as argon2 from 'argon2';
import { Db } from './db';

async function main() {
  const db = new Db();
  await db.$connect();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set SEED_SUPERADMIN_PASSWORD to at least 12 characters');
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@pcdav.local';
  const existingSuperadmin = await db.user.findFirst({ where: { role: 'SUPERADMIN' } });
  if (existingSuperadmin && existingSuperadmin.email !== email.toLowerCase()) throw new Error('One Superadmin already exists; seed does not provision another');
  const school = await db.school.upsert({ where: { id: '00000000-0000-0000-0000-000000000001' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000001', name: 'P DAV PUBLIC SCHOOL', admissionPrefix: 'PDAV' } });
  const defaultHeads = [
    ['TUITION', 'Tuition Fee', 'MONTHLY'], ['SCIENCE', 'Science Fee', 'MONTHLY'], ['COMPUTER', 'Computer Fee', 'MONTHLY'],
    ['ANNUAL_MAINTENANCE', 'Annual Maintenance Fee', 'ANNUAL'], ['EXAMINATION', 'Examination Fee', 'HALF_YEARLY'],
    ['REGISTRATION', 'Registration Fee', 'NEW_ADMISSION'], ['ADMISSION', 'Admission Charge', 'NEW_ADMISSION'],
    ['TRANSPORT', 'Transport Fee', 'SERVICE'], ['HOSTEL_ADMISSION', 'Hostel Admission Fee', 'SERVICE'], ['HOSTEL_MONTHLY', 'Hostel Fee', 'SERVICE'],
  ] as const;
  for (const [code, name, category] of defaultHeads) await db.feeHead.upsert({ where: { schoolId_code: { schoolId: school.id, code } }, update: { name, category, active: true }, create: { schoolId: school.id, code, name, category } });
  const session = await db.academicSession.upsert({ where: { id: '00000000-0000-0000-0000-000000000002' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000002', schoolId: school.id, name: '2026–2027', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), current: true, admissionsOpen: true } });
  const superadmin = await db.user.upsert({ where: { email: email.toLowerCase() }, update: {}, create: { schoolId: school.id, name: 'Superadmin', email: email.toLowerCase(), passwordHash: await argon2.hash(password), role: 'SUPERADMIN', active: true, mustChangePassword: true } });
  if (!process.argv.includes('--demo')) { console.log(`School and Superadmin ready: ${superadmin.email}. Existing passwords are never overwritten.`); await db.$disconnect(); return; }
  if (process.env.NODE_ENV === 'production') throw new Error('Synthetic seed is disabled in production');
  const viA = await db.classOffering.upsert({ where: { id: '00000000-0000-0000-0000-000000000003' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000003', schoolId: school.id, sessionId: session.id, grade: 'VI', section: 'A', capacity: 40 } });
  await db.classOffering.upsert({ where: { id: '00000000-0000-0000-0000-000000000004' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000004', schoolId: school.id, sessionId: session.id, grade: 'VI', section: 'B', capacity: 40 } });
  const family = await db.family.upsert({ where: { id: '00000000-0000-0000-0000-000000000005' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000005', schoolId: school.id, label: 'Sample Student family' } });
  await db.guardian.upsert({ where: { id: '00000000-0000-0000-0000-000000000006' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000006', schoolId: school.id, familyId: family.id, name: 'Sample Guardian', relationship: 'Guardian', phone: '9111111111' } });
  const student = await db.student.upsert({ where: { id: '00000000-0000-0000-0000-000000000007' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000007', schoolId: school.id, admissionNumber: 'PDAV-0001', name: 'Sample Student', dateOfBirth: new Date('2014-04-12'), gender: 'BOY', familyId: family.id, admissionDate: new Date('2026-04-01') } });
  await db.enrollment.upsert({ where: { schoolId_studentId_sessionId: { schoolId: school.id, studentId: student.id, sessionId: session.id } }, update: {}, create: { schoolId: school.id, studentId: student.id, sessionId: session.id, classId: viA.id, startDate: new Date('2026-04-01'), status: 'ACTIVE', entryType: 'CONTINUING' } });
  await db.school.updateMany({ where: { id: school.id, nextAdmission: { lt: 2 } }, data: { nextAdmission: 2 } });
  console.log(`Synthetic records ready for ${school.name}. Login: ${superadmin.email}. Password is not logged.`);
  await db.$disconnect();
}
main().catch(error => { console.error(error); process.exit(1); });
