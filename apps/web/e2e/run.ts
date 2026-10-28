import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { createTestDatabase } from '../../api/test/helpers/test-database.js';
import { User } from '../../api/src/identity/user.entity.js';
import { PasswordService } from '../../api/src/auth/password.service.js';

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
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: database.orm.config.get('clientUrl'),
  APP_ORIGIN: 'http://127.0.0.1:3100',
  API_INTERNAL_URL: 'http://127.0.0.1:3101',
  API_HOST: '127.0.0.1',
  API_PORT: '3101',
  NODE_ENV: 'test',
  BROWSER_PASSWORD: password,
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
  const api = start(resolve(root, 'apps/api/dist/main.js'), []);
  await ready('http://127.0.0.1:3101/api/health/ready', api);
  const web = start(
    resolve(root, 'apps/web/node_modules/next/dist/bin/next'),
    ['start', '--hostname', '127.0.0.1', '--port', '3100'],
    resolve(root, 'apps/web'),
  );
  await ready('http://127.0.0.1:3100/login', web);
  const runner = start(
    resolve(root, 'apps/web/node_modules/@playwright/test/cli.js'),
    ['test', '--config', resolve(root, 'apps/web/playwright.config.ts')],
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
}
