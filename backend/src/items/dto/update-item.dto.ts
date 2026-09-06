import { PartialType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';

/** Every field optional — PATCH applies only what the caller sends. */
export class UpdateItemDto extends PartialType(CreateItemDto) {}
