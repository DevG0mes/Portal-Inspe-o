import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuthService } from '../auth/auth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [AccessModule, AuditModule],
  controllers: [UsersController],
  providers: [
    {
      provide: UsersService,
      inject: [DATABASE, AccessPolicy, AuditService, AuthService],
      useFactory: (
        database: MikroORM,
        access: AccessPolicy,
        audit: AuditService,
        auth: AuthService,
      ) => new UsersService(database.em, access, audit, auth, new PasswordService()),
    },
  ],
  exports: [UsersService],
})
export class IdentityModule {}
