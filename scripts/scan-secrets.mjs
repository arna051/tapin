import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const roots = ['src', 'test', 'scripts', 'docs', 'examples', '.github'];
const files = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'package.json'];
const textExtensions = new Set(['.ts', '.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml']);
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[opusr]_[A-Za-z0-9]{30,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['npm token', /\bnpm_[A-Za-z0-9]{30,}\b/],
];

const walk = async (directory) => {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (textExtensions.has(extname(entry.name))) files.push(path);
  }
};
for (const directory of roots) await walk(directory);

const findings = [];
for (const file of [...new Set(files)].sort()) {
  if (file === 'scripts/scan-secrets.mjs') continue;
  const content = await readFile(join(root, file), 'utf8');
  for (const [label, pattern] of rules) {
    if (pattern.test(content)) findings.push(`${relative(root, join(root, file))}: ${label}`);
  }
}
if (findings.length) {
  console.error(`Potential secrets found:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed for ${new Set(files).size} source and package files`);
}
