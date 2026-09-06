import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ItemsModule } from './items/items.module';
import { LocationsModule } from './locations/locations.module';
import { MovementsModule } from './movements/movements.module';
import { ReportsModule } from './reports/reports.module';
import { AdminSettingsModule } from './admin/settings/settings.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AppConfigModule,
    HealthModule,
    AuthModule,
    ItemsModule,
    LocationsModule,
    MovementsModule,
    ReportsModule,
    AdminSettingsModule,
  ],
  providers: [
    // Order matters: authentication runs first and populates `request.user`,
    // which the authorisation guard then reads. Registering both globally makes
    // "authenticated by default, authorised by declaration" the baseline, so a
    // new controller cannot accidentally ship unprotected.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
