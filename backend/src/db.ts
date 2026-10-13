import { Injectable, OnModuleInit, OnModuleDestroy, ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }

  async atomic<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.$transaction(operation, { isolationLevel: 'Serializable', timeout: 15000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 3) continue;
        throw error;
      }
    }
    throw new ConflictException('Concurrent change; please reload and try again');
  }
}

export async function audit(tx: Tx, actor: { id: string; schoolId: string }, action: string, entityType: string, entityId: string, reason: string, before?: unknown, after?: unknown) {
  const json = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as Prisma.InputJsonValue;
  await tx.auditEvent.create({ data: { schoolId: actor.schoolId, actorId: actor.id, action, entityType, entityId, reason, before: json(before), after: json(after) } });
}
