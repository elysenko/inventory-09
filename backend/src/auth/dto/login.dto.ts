import { IsNotEmpty, IsString } from 'class-validator';

/**
 * `email` is validated with `IsString`, not `IsEmail`, on purpose: platform-minted
 * logins are not guaranteed to be RFC-valid addresses, and an `IsEmail` check would
 * lock those accounts out of their own app.
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'email should not be empty' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'password should not be empty' })
  password!: string;
}
