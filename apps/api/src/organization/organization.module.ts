import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationController } from './organization.controller.js';
import { MembershipsService } from './memberships.service.js';
import { MembershipsController } from './memberships.controller.js';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

@Module({
  imports: [AccessModule, AuditModule],
  controllers: [OrganizationController, MembershipsController, CustomerController],
  providers: [
    {
      provide: CustomerService,
      inject: [DATABASE, AccessPolicy, AuditService],
      useFactory: (database: MikroORM, access: AccessPolicy, audit: AuditService) =>
        new CustomerService(database.em, access, audit),
    },
    {
      provide: OrganizationService,
      inject: [DATABASE, AccessPolicy, AuditService],
      useFactory: (database: MikroORM, access: AccessPolicy, audit: AuditService) =>
        new OrganizationService(database.em, access, audit),
    },
    {
      provide: MembershipsService,
      inject: [DATABASE, AccessPolicy, AuditService],
      useFactory: (database: MikroORM, access: AccessPolicy, audit: AuditService) =>
        new MembershipsService(database.em, access, audit),
    },
  ],
  exports: [OrganizationService, MembershipsService, CustomerService],
})
export class OrganizationModule {}
