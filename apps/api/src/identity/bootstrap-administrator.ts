import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { MikroORM } from '@mikro-orm/postgresql';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { normalizedEmail } from '../auth/dto/login.dto.js';
import { newPasswordSchema } from '../auth/dto/change-password.dto.js';
import { User } from './user.entity.js';

const inputSchema = z.object({ email: normalizedEmail, password: newPasswordSchema }).strict();

/** One-time local provisioning. This is intentionally never exposed as a public HTTP route. */
export async function bootstrapAdministrator(database: MikroORM, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException('Informe e-mail válido e senha entre 15 e 128 caracteres.');
  const digest = await new PasswordService().hash(parsed.data.password);
  return database.em.fork().transactional(async (em) => {
    // There may be no rows to lock yet. A transaction-scoped advisory lock serializes bootstrap.
    await em.execute('select pg_advisory_xact_lock(27061003)');
    if ((await em.count(User, {})) !== 0)
      throw new ConflictException('O cadastro inicial já foi realizado.');
    const user = new User();
    user.email = parsed.data.email;
    user.name = 'Administrador inicial';
    user.passwordHash = digest;
    user.role = 'ADMIN';
    user.mustChangePassword = true;
    em.persist(user);
    await new AuditService(em).record(
      {
        action: 'identity.bootstrap',
        resource: 'user',
        resourceId: user.id,
        requestId: randomUUID(),
      },
      em,
    );
    return { id: user.id, email: user.email };
  });
}
