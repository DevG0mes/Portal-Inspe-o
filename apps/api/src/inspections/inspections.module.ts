import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { InspectionService } from './inspection.service.js';
import { InspectionsController } from './inspections.controller.js';
@Module({
  imports: [AccessModule, AuditModule],
  controllers: [InspectionsController],
  providers: [
    {
      provide: InspectionService,
      inject: [DATABASE, AccessPolicy, AuditService],
      useFactory: (db: MikroORM, access: AccessPolicy, audit: AuditService) =>
        new InspectionService(db.em, access, audit),
    },
  ],
})
export class InspectionsModule {}
