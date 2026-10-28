import { Module } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AccessModule } from '../access/access.module.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { FormsController } from './forms.controller.js';
import { FormTemplateService } from './form-template.service.js';
import { FormVersionService } from './form-version.service.js';
import { RuleEngine } from './rule-engine.service.js';

@Module({
  imports: [AccessModule, AuditModule],
  controllers: [FormsController],
  providers: [
    RuleEngine,
    {
      provide: FormTemplateService,
      inject: [DATABASE, AccessPolicy, AuditService, RuleEngine],
      useFactory: (
        database: MikroORM,
        access: AccessPolicy,
        audit: AuditService,
        engine: RuleEngine,
      ) => new FormTemplateService(database.em, access, audit, engine),
    },
    {
      provide: FormVersionService,
      inject: [DATABASE, AccessPolicy, AuditService, RuleEngine],
      useFactory: (
        database: MikroORM,
        access: AccessPolicy,
        audit: AuditService,
        engine: RuleEngine,
      ) => new FormVersionService(database.em, access, audit, engine),
    },
  ],
  exports: [RuleEngine, FormVersionService],
})
export class FormsModule {}
