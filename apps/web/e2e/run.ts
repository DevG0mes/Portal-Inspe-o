import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { createTestDatabase } from '../../api/test/helpers/test-database.js';
import { User } from '../../api/src/identity/user.entity.js';
import { PasswordService } from '../../api/src/auth/password.service.js';
import { Unit } from '../../api/src/organization/unit.entity.js';
import { Sector } from '../../api/src/organization/sector.entity.js';
import { UnitMembership, SectorMembership } from '../../api/src/organization/membership.entity.js';
import { FormTemplate } from '../../api/src/forms/entities/form-template.entity.js';
import { FormVersion } from '../../api/src/forms/entities/form-version.entity.js';
import {
  InspectionSchedule,
  InspectionAssignment,
  ScheduleResponsible,
  AssignmentResponsible,
} from '../../api/src/schedules/schedule.entity.js';
import { cleanupBrowserQueue } from '../../worker/src/test-support.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
// Never reuse an unrelated process that happens to answer on a test port.
for (const port of [3100, 3101]) {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  });
}
const database = await createTestDatabase();
const children: ChildProcess[] = [];
const password = `Test-${randomBytes(20).toString('hex')}`;
const queueName = `portal-browser-schedules-${randomBytes(8).toString('hex')}`;
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: database.orm.config.get('clientUrl'),
  APP_ORIGIN: 'http://127.0.0.1:3100',
  API_INTERNAL_URL: 'http://127.0.0.1:3101',
  API_HOST: '127.0.0.1',
  API_PORT: '3101',
  NODE_ENV: 'test',
  BROWSER_PASSWORD: password,
  SCHEDULE_QUEUE_NAME: queueName,
  SCHEDULE_POLL_MS: '1000',
};
function start(file: string, args: string[], cwd = root, output = false) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd,
    env,
    stdio: output ? 'inherit' : 'pipe',
    windowsHide: true,
  });
  children.push(child);
  if (!output) {
    child.stdout?.resume();
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk);
      if (/Error|failed/i.test(text)) process.stderr.write(text);
    });
  }
  return child;
}
async function ready(url: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (child.exitCode !== null) throw new Error('Test server exited before readiness');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* Startup is bounded below. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Test server readiness timeout');
}
try {
  const hash = await new PasswordService().hash(password);
  const em = database.orm.em.fork();
  for (const [name, role, change] of [
    ['Administrador teste', 'ADMIN', false],
    ['Gestor teste', 'MANAGER', false],
    ['Colaborador teste', 'COLLABORATOR', false],
    ['Primeiro acesso', 'COLLABORATOR', true],
  ] as const) {
    const user = new User();
    user.name = name;
    user.email = `${role.toLowerCase()}${change ? '-first' : ''}@example.test`;
    user.role = role;
    user.passwordHash = hash;
    user.mustChangePassword = change;
    em.persist(user);
  }
  for (let index = 0; index < 12; index++) {
    const user = new User();
    user.name = `Pessoa teste ${String(index).padStart(2, '0')}`;
    user.email = `person-${index}@example.test`;
    user.passwordHash = hash;
    em.persist(user);
  }
  for (const device of ['desktop', 'mobile']) {
    const user = new User();
    user.name = `Primeiro acesso ${device}`;
    user.email = `first-${device}@example.test`;
    user.passwordHash = hash;
    em.persist(user);
  }
  await em.flush();
  const unit = new Unit();
  unit.name = 'Unidade de testes';
  unit.nameKey = 'unidade de testes';
  const sector = new Sector();
  sector.name = 'Setor de testes';
  sector.nameKey = 'setor de testes';
  sector.unit = unit;
  const outside = new Sector();
  outside.name = 'Setor restrito';
  outside.nameKey = 'setor restrito';
  outside.unit = unit;
  em.persist([unit, sector, outside]);
  for (const role of ['MANAGER', 'COLLABORATOR'] as const) {
    const user = await em.findOneOrFail(User, { email: `${role.toLowerCase()}@example.test` });
    const parent = new UnitMembership();
    parent.user = user;
    parent.unit = unit;
    const child = new SectorMembership();
    child.unitMembership = parent;
    child.sector = sector;
    em.persist([parent, child]);
  }
  const admin = await em.findOneOrFail(User, { email: 'admin@example.test' });
  const form = new FormTemplate();
  Object.assign(form, {
    name: 'Ficha de testes',
    nameKey: 'ficha de testes',
    state: 'PUBLISHED',
    latestVersion: 1,
    draftSnapshot: null,
  });
  const version = new FormVersion();
  Object.assign(version, {
    template: form,
    number: 1,
    publishedBy: admin,
    contentHash: 'a'.repeat(64),
    snapshot: {
      schemaVersion: 1,
      title: 'Ficha de testes',
      sections: [
        {
          id: randomUUID(),
          title: 'Área',
          questions: [
            { id: randomUUID(), label: 'Área segura?', type: 'YES_NO_NA', required: false },
          ],
        },
      ],
    },
  });
  em.persist([form, version]);
  const collaborator = await em.findOneOrFail(User, { email: 'collaborator@example.test' });
  for (const device of ['desktop', 'mobile']) {
    const schedule = new InspectionSchedule();
    Object.assign(schedule, {
      name: `Ronda disponível ${device}`,
      unit,
      sector,
      form,
      createdBy: admin,
      frequency: 'ONCE',
      startDate: '2026-10-28',
      time: '00:00',
      deadlineHours: 24,
    });
    const responsible = new ScheduleResponsible();
    Object.assign(responsible, { schedule, user: collaborator });
    const assignment = new InspectionAssignment();
    Object.assign(assignment, {
      schedule,
      formVersion: version,
      occurrenceAt: new Date(Date.now() - 60000),
      dueAt: new Date(Date.now() + 86400000),
    });
    const assigned = new AssignmentResponsible();
    Object.assign(assigned, { assignment, user: collaborator });
    em.persist([schedule, responsible, assignment, assigned]);
  }
  await em.flush();
  const api = start(resolve(root, 'apps/api/dist/main.js'), []);
  await ready('http://127.0.0.1:3101/api/health/ready', api);
  const web = start(
    resolve(root, 'apps/web/node_modules/next/dist/bin/next'),
    ['start', '--hostname', '127.0.0.1', '--port', '3100'],
    resolve(root, 'apps/web'),
  );
  await ready('http://127.0.0.1:3100/login', web);
  start(resolve(root, 'apps/worker/dist/main.js'), []);
  const runner = start(
    resolve(root, 'apps/web/node_modules/@playwright/test/cli.js'),
    ['test', '--config', resolve(root, 'apps/web/playwright.config.ts'), ...process.argv.slice(2)],
    root,
    true,
  );
  const [code] = await once(runner, 'exit');
  process.exitCode = code ?? 1;
} finally {
  for (const child of children.reverse())
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  await database.close();
  await cleanupBrowserQueue(queueName, process.env.REDIS_URL!);
}
