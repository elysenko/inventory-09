import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { LowStockRow, ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('low-stock')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Items at or below their reorder point (manager only)' })
  lowStock(): Promise<LowStockRow[]> {
    return this.reportsService.lowStock();
  }
}
