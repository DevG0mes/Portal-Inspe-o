import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { requestContext } from './common/request-id.middleware.js';
import { authenticationLimit } from './common/rate-limit.config.js';
import { HttpErrorFilter } from './common/http-error.filter.js';
import { writeOperationalLog, type OperationalLog } from './common/logging.js';
import { RequestContext } from '@mikro-orm/core';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DatabaseModule } from './database/database.module.js';
import { AuditModule } from './audit/audit.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService, type HealthChecks } from './health/health.service.js';
import { AuthModule } from './auth/auth.module.js';
import type { AuthOptions } from './auth/auth.types.js';
import { IdentityModule } from './identity/identity.module.js';
import { OrganizationModule } from './organization/organization.module.js';
import { FormsModule } from './forms/forms.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { InspectionsModule } from './inspections/inspections.module.js';
import { FilesModule } from './files/files.module.js';
import { ActionPlansModule } from './action-plans/action-plans.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { MinioStorageAdapter } from './files/minio-storage.adapter.js';
import type { StorageAdapter } from './files/storage.adapter.js';
import { loadEnvironment } from '@portal/config';

/** Compose without opening a port, allowing HTTP tests and production to share setup. */
export async function createApplication(
  checks: HealthChecks,
  onShutdown?: () => Promise<void>,
  database?: MikroORM,
  authOptions: AuthOptions = {
    secureCookies: process.env.NODE_ENV === 'production',
    origin: process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000',
  },
  storage?: StorageAdapter,
  operations: { log?: OperationalLog; authLimit?: number } = {},
) {
  const environment = database ? loadEnvironment(process.env) : undefined;
  @Module({
    imports: database
      ? [
          DatabaseModule.register(database),
          AuditModule,
          AuthModule.register(authOptions),
          IdentityModule,
          OrganizationModule,
          FormsModule,
          SchedulesModule,
          InspectionsModule,
          ActionPlansModule,
          NotificationsModule,
          AnalyticsModule,
          ReportsModule.register(storage ?? new MinioStorageAdapter(environment!)),
          FilesModule.register(
            storage ?? new MinioStorageAdapter(environment!),
            environment!.EVIDENCE_MAX_BYTES,
          ),
        ]
      : [],
    controllers: [HealthController],
    providers: [
      { provide: HealthService, useValue: new HealthService(checks) },
      { provide: 'INFRASTRUCTURE_LIFECYCLE', useValue: { onApplicationShutdown: onShutdown } },
    ],
  })
  class AppModule {}

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    abortOnError: false,
  });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(
    requestContext(
      operations.log ?? (process.env.NODE_ENV === 'test' ? () => {} : writeOperationalLog),
    ),
  );
  app.use(authenticationLimit(operations.authLimit));
  app.useGlobalFilters(new HttpErrorFilter());
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('raw', { type: 'application/octet-stream', limit: '25mb' });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: authOptions.origin,
    credentials: true,
    allowedHeaders: ['Content-Type'],
  });
  if (database) {
    app.use((_request: unknown, _response: unknown, next: () => void) => {
      RequestContext.create(database.em, next);
    });
  }
  app.enableShutdownHooks();
  return app;
}
