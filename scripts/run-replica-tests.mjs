import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? signal}`)),
    );
  });
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('Could not allocate a MongoDB test port')),
      );
    });
  });
const waitFor = async (check, label) => {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`, { cause: lastError });
};
const quietEval = (uri, expression) =>
  new Promise((resolve) => {
    const child = spawn('mongosh', [uri, '--quiet', '--eval', expression], {
      stdio: 'ignore',
    });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });

const directory = await mkdtemp(join(tmpdir(), 'tapin-mongodb-'));
const port = await freePort();
const replicaSet = 'tapin_test_rs';
const uri = `mongodb://127.0.0.1:${port}/?replicaSet=${replicaSet}`;
const directUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`;
const logPath = join(directory, 'mongod.log');
const mongod = spawn(
  'mongod',
  [
    '--dbpath',
    directory,
    '--port',
    String(port),
    '--bind_ip',
    '127.0.0.1',
    '--replSet',
    replicaSet,
    '--logpath',
    logPath,
  ],
  { stdio: 'ignore' },
);

try {
  await waitFor(() => quietEval(directUri, 'db.adminCommand({ping:1}).ok === 1'), 'mongod');
  await run('mongosh', [
    directUri,
    '--quiet',
    '--eval',
    `rs.initiate({_id:${JSON.stringify(replicaSet)},members:[{_id:0,host:${JSON.stringify(`127.0.0.1:${port}`)}}]})`,
  ]);
  await waitFor(
    () => quietEval(directUri, 'db.hello().isWritablePrimary === true'),
    'MongoDB primary',
  );
  await run(join(process.cwd(), 'node_modules/.bin/vitest'), ['run', 'test/replica.test.ts'], {
    env: { ...process.env, TAPIN_TEST_MONGODB_URI: uri },
  });
} catch (error) {
  try {
    console.error(await readFile(logPath, 'utf8'));
  } catch {
    // The process may have failed before creating a log.
  }
  throw error;
} finally {
  mongod.kill('SIGTERM');
  if (mongod.exitCode === null && mongod.signalCode === null)
    await new Promise((resolve) => mongod.once('exit', resolve));
  await rm(directory, { recursive: true, force: true });
}
