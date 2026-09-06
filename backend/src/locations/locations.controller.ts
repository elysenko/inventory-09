import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Location, Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  /** Any authenticated role — the movement form needs the picker options. */
  @Get()
  @ApiOperation({ summary: 'List every storage location' })
  findAll(): Promise<Location[]> {
    return this.locationsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One location' })
  findOne(@Param('id') id: string): Promise<Location> {
    return this.locationsService.findOne(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a location (manager only)' })
  create(@Body() dto: CreateLocationDto): Promise<Location> {
    return this.locationsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update a location (manager only)' })
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto): Promise<Location> {
    return this.locationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a location that holds no stock' })
  remove(@Param('id') id: string): Promise<void> {
    return this.locationsService.remove(id);
  }
}
