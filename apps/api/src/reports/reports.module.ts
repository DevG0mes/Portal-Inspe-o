import { Module, type DynamicModule } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import type { StorageAdapter } from '../files/storage.adapter.js';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';
@Module({})
export class ReportsModule {
  static register(storage: StorageAdapter): DynamicModule {
    return {
      module: ReportsModule,
      imports: [AccessModule, AuditModule],
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          inject: [DATABASE, AccessPolicy, AuditService],
          useFactory: (db: MikroORM, access: AccessPolicy, audit: AuditService) =>
            new ReportsService(db.em, access, audit, storage),
        },
      ],
    };
  }
}
