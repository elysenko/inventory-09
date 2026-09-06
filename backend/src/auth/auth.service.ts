import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthenticatedUser } from './current-user.decorator';
import { JWT_EXPIRES_IN_SECONDS } from './jwt.constants';

const BCRYPT_ROUNDS = 10;

/** Public projection of a user — never carries `passwordHash`. */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static toPublicUser(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): PublicUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private issueToken(user: PublicUser): string {
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: JWT_EXPIRES_IN_SECONDS },
    );
  }

  /**
   * Verifies credentials against the bcrypt hash written by
   * `prisma/seed/seed.js` (same column, same library, same cost) so the logins
   * Colossus mints work without any extra provisioning step.
   *
   * Both "unknown email" and "wrong password" return the identical 401 so the
   * endpoint cannot be used to enumerate registered addresses.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    const invalid = new UnauthorizedException('Invalid email or password');
    if (!user) {
      // Spend a comparable amount of time on the unknown-email path so response
      // timing does not leak whether the address exists.
      await bcrypt.compare(dto.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
      throw invalid;
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) throw invalid;

    const publicUser = AuthService.toPublicUser(user);
    return { accessToken: this.issueToken(publicUser), user: publicUser };
  }

  /**
   * Self-service registration.
   *
   * The very first account in an empty database becomes a MANAGER so a fresh
   * install is not locked out of its own management screens; every subsequent
   * signup is a CLERK. In a deployed Colossus app the platform accounts are
   * seeded first, so this always yields CLERK.
   */
  async signup(dto: SignupDto): Promise<AuthResult> {
    const email = dto.email.trim();
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const existingUsers = await tx.user.count();
        const role = existingUsers === 0 ? Role.MANAGER : Role.CLERK;
        return tx.user.create({
          data: { email, name: dto.name?.trim() || null, passwordHash, role },
          select: { id: true, email: true, name: true, role: true },
        });
      });

      const publicUser = AuthService.toPublicUser(user);
      return { accessToken: this.issueToken(publicUser), user: publicUser };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          message: 'An account with that email already exists',
          fieldErrors: { email: 'An account with that email already exists' },
        });
      }
      throw error;
    }
  }

  async me(user: AuthenticatedUser): Promise<PublicUser> {
    const fresh = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!fresh) throw new UnauthorizedException();
    return AuthService.toPublicUser(fresh);
  }
}
