import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateLocationDto {
  /** Unique — the seed upserts locations on this natural key. */
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'zone should not be empty' })
  @MaxLength(64)
  zone!: string;
}
