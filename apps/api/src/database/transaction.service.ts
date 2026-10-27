import type { EntityManager } from '@mikro-orm/postgresql';

/** Keep one manager for the complete business operation, including its audit record. */
export class TransactionService {
  constructor(private readonly entityManager: EntityManager) {}

  run<T>(operation: (transaction: EntityManager) => Promise<T>): Promise<T> {
    return this.entityManager.transactional(operation);
  }
}
