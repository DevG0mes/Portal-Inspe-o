import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { RequestContext } from '@mikro-orm/core';
import type { MikroORM } from '@mikro-orm/postgresql';
import { DatabaseModule } from './database/database.module.js';
import { AuditModule } from './audit/audit.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService, type HealthChecks } from './health/health.service.js';
import { AuthModule } from './auth/auth.module.js';
import type { AuthOptions } from './auth/auth.types.js';

/** Compose without opening a port, allowing HTTP tests and production to share setup. */
export async function createApplication(
  checks: HealthChecks,
  onShutdown?: () => Promise<void>,
  database?: MikroORM,
  authOptions: AuthOptions = {
    secureCookies: process.env.NODE_ENV === 'production',
    origin: process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000',
  },
) {
  @Module({
    imports: database
      ? [DatabaseModule.register(database), AuditModule, AuthModule.register(authOptions)]
      : [],
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
  app.enableCors({
    origin: authOptions.origin,
    credentials: true,
    allowedHeaders: ['Content-Type'],
  });
  app.use((request: Request & { requestId?: string }, response: Response, next: () => void) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  if (database) {
    app.use((_request: unknown, _response: unknown, next: () => void) => {
      RequestContext.create(database.em, next);
    });
  }
  app.enableShutdownHooks();
  return app;
}
