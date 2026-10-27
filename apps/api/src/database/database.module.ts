import { Module, type DynamicModule } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { TransactionService } from './transaction.service.js';

export const DATABASE = Symbol('DATABASE');

/** One ORM per process; its root manager resolves the active RequestContext. */
@Module({})
export class DatabaseModule {
  static register(database: MikroORM): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        { provide: DATABASE, useValue: database },
        { provide: TransactionService, useFactory: () => new TransactionService(database.em) },
      ],
      exports: [DATABASE, TransactionService],
    };
  }
}
