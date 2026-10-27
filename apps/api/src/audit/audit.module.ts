import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AuditService } from './audit.service.js';

@Module({
  providers: [
    {
      provide: AuditService,
      inject: [DATABASE],
      useFactory: (database: MikroORM) => new AuditService(database.em),
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
