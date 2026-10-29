import { Module, type DynamicModule } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DATABASE } from '../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { InspectionsModule } from '../inspections/inspections.module.js';
import { InspectionService } from '../inspections/inspection.service.js';
import { FileService } from './file.service.js';
import { FilesController } from './files.controller.js';
import type { StorageAdapter } from './storage.adapter.js';
@Module({})
export class FilesModule {
  static register(storage: StorageAdapter, maxBytes: number): DynamicModule {
    return {
      module: FilesModule,
      imports: [InspectionsModule, AuditModule],
      controllers: [FilesController],
      providers: [
        {
          provide: FileService,
          inject: [DATABASE, InspectionService, AuditService],
          useFactory: (db: MikroORM, inspections: InspectionService, audit: AuditService) =>
            new FileService(db.em, inspections, audit, storage, maxBytes),
        },
      ],
    };
  }
}
