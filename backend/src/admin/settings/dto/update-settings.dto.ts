import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { MANAGED_KEY_NAMES } from '../../../config/config.service';

export class SettingEntryDto {
  /**
   * Restricted to the managed allowlist. Accepting arbitrary keys would turn
   * this endpoint into a write-anything key/value store reachable by anyone
   * holding an admin token.
   */
  @IsString()
  @IsIn(MANAGED_KEY_NAMES, { message: `key must be one of: ${MANAGED_KEY_NAMES.join(', ')}` })
  key!: string;

  @IsString({ message: 'value must be a string' })
  @MaxLength(4096)
  value!: string;
}

export class UpdateSettingsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'entries must contain at least one key/value pair' })
  @ValidateNested({ each: true })
  @Type(() => SettingEntryDto)
  entries!: SettingEntryDto[];
}
