import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Single Prisma connection pool for the process, tied to the Nest lifecycle.
 *
 * Connecting in `onModuleInit` surfaces a bad `DATABASE_URL` at boot rather
 * than on the first request, and disconnecting in `onModuleDestroy` lets the
 * pod drain its pool cleanly on SIGTERM instead of dropping sockets.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
