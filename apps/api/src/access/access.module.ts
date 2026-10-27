import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { AccessPolicy } from './access-policy.service.js';
import { RolesGuard } from './roles.decorator.js';
import { ScopeGuard } from './scope.guard.js';

@Module({
  imports: [AuditModule],
  providers: [
    {
      provide: AccessPolicy,
      inject: [DATABASE, AuditService],
      useFactory: (database: MikroORM, audit: AuditService) => new AccessPolicy(database.em, audit),
    },
    RolesGuard,
    ScopeGuard,
  ],
  exports: [AccessPolicy, RolesGuard, ScopeGuard],
})
export class AccessModule {}
