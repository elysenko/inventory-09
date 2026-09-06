import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness. Deliberately touches nothing but the process itself — a database
   * outage must not make Kubernetes restart an otherwise healthy pod, and the
   * previous scaffold's self-ping made this check depend on its own HTTP
   * reflection.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness — process is up (no dependencies checked)' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness. Answers 503 when the database is unreachable so traffic is
   * withheld until the pod can actually serve it, while the process stays up.
   */
  @Get('deep')
  @ApiOperation({ summary: 'Readiness — verifies the database round-trips' })
  async deep(@Res() res: Response): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(HttpStatus.OK).json({ status: 'ok', db: 'up' });
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: 'error', db: 'down' });
    }
  }
}
