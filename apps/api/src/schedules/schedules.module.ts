import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { ScheduleService } from './schedule.service.js';
import { SchedulesController } from './schedules.controller.js';
@Module({
  imports: [AccessModule, AuditModule],
  controllers: [SchedulesController],
  providers: [
    {
      provide: ScheduleService,
      inject: [DATABASE, AccessPolicy, AuditService],
      useFactory: (database: MikroORM, access: AccessPolicy, audit: AuditService) =>
        new ScheduleService(database.em, access, audit),
    },
  ],
})
export class SchedulesModule {}
