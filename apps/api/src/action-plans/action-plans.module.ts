import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { ActionPlanAccess } from './action-plan.access.js';
import { ActionPlanService } from './action-plan.service.js';
import { ActionPlansController } from './action-plans.controller.js';
@Module({
  imports: [AccessModule, AuditModule],
  controllers: [ActionPlansController],
  providers: [
    {
      provide: ActionPlanAccess,
      inject: [AccessPolicy],
      useFactory: (access: AccessPolicy) => new ActionPlanAccess(access),
    },
    {
      provide: ActionPlanService,
      inject: [DATABASE, AccessPolicy, ActionPlanAccess, AuditService],
      useFactory: (
        db: MikroORM,
        access: AccessPolicy,
        policy: ActionPlanAccess,
        audit: AuditService,
      ) => new ActionPlanService(db.em, access, policy, audit),
    },
  ],
  exports: [ActionPlanAccess],
})
export class ActionPlansModule {}
