import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';
@Module({
  imports: [AccessModule],
  controllers: [AnalyticsController],
  providers: [
    {
      provide: AnalyticsService,
      inject: [DATABASE, AccessPolicy],
      useFactory: (db: MikroORM, access: AccessPolicy) => new AnalyticsService(db.em, access),
    },
  ],
})
export class AnalyticsModule {}
