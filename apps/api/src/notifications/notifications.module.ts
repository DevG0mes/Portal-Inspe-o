import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { ActionPlansModule } from '../action-plans/action-plans.module.js';
import { ActionPlanAccess } from '../action-plans/action-plan.access.js';
import { NotificationService } from './notification.service.js';
import { NotificationsController } from './notifications.controller.js';
@Module({
  imports: [AccessModule, ActionPlansModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NotificationService,
      inject: [DATABASE, AccessPolicy, ActionPlanAccess],
      useFactory: (db: MikroORM, access: AccessPolicy, plans: ActionPlanAccess) =>
        new NotificationService(db.em, access, plans),
    },
  ],
})
export class NotificationsModule {}
