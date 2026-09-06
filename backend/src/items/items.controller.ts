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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { Paginated } from '../common/pagination.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemDetail, ItemsService, ItemWithTotals } from './items.service';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  /** Reading the catalogue is open to every authenticated role. */
  @Get()
  @ApiOperation({ summary: 'List items with on-hand totals' })
  findAll(@Query() query: QueryItemsDto): Promise<Paginated<ItemWithTotals>> {
    return this.itemsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One item plus its per-location stock breakdown' })
  findOne(@Param('id') id: string): Promise<ItemDetail> {
    return this.itemsService.findOne(id);
  }

  @Post()
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an item (manager only)' })
  create(@Body() dto: CreateItemDto): Promise<ItemWithTotals> {
    return this.itemsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update an item (manager only)' })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto): Promise<ItemWithTotals> {
    return this.itemsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an item with no stock and no movement history' })
  remove(@Param('id') id: string): Promise<void> {
    return this.itemsService.remove(id);
  }
}
