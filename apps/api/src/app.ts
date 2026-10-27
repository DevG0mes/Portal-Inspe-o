import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RequestContext } from '@mikro-orm/core';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DatabaseModule } from './database/database.module.js';
import { AuditModule } from './audit/audit.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService, type HealthChecks } from './health/health.service.js';

/** Compose without opening a port, allowing HTTP tests and production to share setup. */
export async function createApplication(
  checks: HealthChecks,
  onShutdown?: () => Promise<void>,
  database?: MikroORM,
) {
  @Module({
    imports: database ? [DatabaseModule.register(database), AuditModule] : [],
    controllers: [HealthController],
    providers: [
      { provide: HealthService, useValue: new HealthService(checks) },
      { provide: 'INFRASTRUCTURE_LIFECYCLE', useValue: { onApplicationShutdown: onShutdown } },
    ],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  app.setGlobalPrefix('api');
  if (database) {
    app.use((_request: unknown, _response: unknown, next: () => void) => {
      RequestContext.create(database.em, next);
    });
  }
  app.enableShutdownHooks();
  return app;
}
