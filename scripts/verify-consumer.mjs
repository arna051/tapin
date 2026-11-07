import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = await mkdtemp(join(tmpdir(), 'tapin-consumer-'));
try {
  await mkdir(join(directory, 'node_modules'), { recursive: true });
  await symlink(root, join(directory, 'node_modules', 'tapin'), 'dir');
  const subpaths = ['', '/browser', '/node', '/mongoose', '/nestjs', '/testing'];
  await writeFile(
    join(directory, 'esm.mjs'),
    `${subpaths.map((path, index) => `import * as m${index} from 'tapin${path}';`).join('\n')}\nif (![${subpaths.map((_, index) => `m${index}`).join(',')}].every(Boolean)) process.exit(1);\n`,
  );
  await writeFile(
    join(directory, 'cjs.cjs'),
    `${subpaths.map((path, index) => `const m${index} = require('tapin${path}');`).join('\n')}\nif (![${subpaths.map((_, index) => `m${index}`).join(',')}].every(Boolean)) process.exit(1);\n`,
  );
  await writeFile(
    join(directory, 'types.ts'),
    `import type { QuoteInput } from 'tapin'; import { listProvinces } from 'tapin/browser'; import { createTapinClient } from 'tapin/node'; import { createTapinModels } from 'tapin/mongoose'; import { TapinModule } from 'tapin/nestjs'; import { successEnvelope } from 'tapin/testing'; void ([listProvinces, createTapinClient, createTapinModels, TapinModule, successEnvelope] satisfies unknown[]); const input = {} as QuoteInput; void input;\n`,
  );
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['types.ts'],
    }),
  );
  execFileSync(process.execPath, ['esm.mjs'], { cwd: directory, stdio: 'inherit' });
  execFileSync(process.execPath, ['cjs.cjs'], { cwd: directory, stdio: 'inherit' });
  execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], {
    cwd: directory,
    stdio: 'inherit',
  });
  console.log('Verified clean-consumer ESM, CommonJS, declarations, and all package subpaths');
} finally {
  await rm(directory, { recursive: true, force: true });
}
