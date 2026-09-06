import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Note the absence of a `role` field. With the global `ValidationPipe`'s
 * `whitelist: true`, a client-supplied `role` (or `isAdmin`, or `id`) is
 * stripped before the service sees it, so signup cannot escalate privilege.
 */
export class SignupDto {
  @IsString()
  @IsNotEmpty({ message: 'email should not be empty' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'password should not be empty' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
