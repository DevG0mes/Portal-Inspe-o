import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthController, AUTH_OPTIONS } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionGuard } from './session.guard.js';
import type { AuthOptions } from './auth.types.js';

@Module({})
export class AuthModule {
  static register(options: AuthOptions): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      imports: [AuditModule],
      controllers: [AuthController],
      providers: [
        { provide: AUTH_OPTIONS, useValue: options },
        PasswordService,
        {
          provide: AuthService,
          inject: [DATABASE, AuditService, PasswordService],
          useFactory: (database: MikroORM, audit: AuditService, passwords: PasswordService) =>
            new AuthService(database.em, audit, passwords),
        },
        {
          provide: APP_GUARD,
          inject: [AuthService, Reflector, AUTH_OPTIONS],
          useFactory: (auth: AuthService, reflector: Reflector, settings: AuthOptions) =>
            new SessionGuard(auth, reflector, settings),
        },
      ],
      exports: [AuthService],
    };
  }
}
