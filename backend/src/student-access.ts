import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor } from './auth';
import { Db } from './db';

@Injectable()
export class StudentAccess {
  constructor(private readonly db: Db) {}
  async classIds(actor: Actor, sessionId?: string): Promise<string[] | null> {
    if (actor.role !== Role.TEACHER) return null;
    const sessions = await this.db.academicSession.findMany({ where: { schoolId: actor.schoolId, ...(sessionId ? { id: sessionId } : { current: true }) } });
    const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    const assignments = await this.db.teacherAssignment.findMany({ where: { schoolId: actor.schoolId, teacherId: actor.id, sessionId: { in: sessions.map(s => s.id) }, endedAt: null, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] } });
    return assignments.map(a => a.classId);
  }
  async student(actor: Actor, id: string) {
    const student = await this.db.student.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!student) throw new NotFoundException('Student not found');
    const classes = await this.classIds(actor);
    if (classes && !await this.db.enrollment.findFirst({ where: { schoolId: actor.schoolId, studentId: id, status: 'ACTIVE', classId: { in: classes } } })) throw new NotFoundException('Student not found in assigned classroom');
    return student;
  }
}
