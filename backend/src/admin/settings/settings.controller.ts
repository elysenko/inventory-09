import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../auth/roles.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingEntryView, SettingsService } from './settings.service';

/**
 * Admin-only, and deliberately stricter than the manager routes: these keys are
 * live service credentials, so MANAGER is not sufficient.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Managed service credentials, masked, with a configured flag' })
  list(): Promise<SettingEntryView[]> {
    return this.settingsService.list();
  }

  @Patch()
  @ApiOperation({ summary: 'Upsert one or more managed credential values' })
  update(@Body() dto: UpdateSettingsDto): Promise<SettingEntryView[]> {
    return this.settingsService.update(dto);
  }
}
