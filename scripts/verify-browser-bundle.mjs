import { readFile } from 'node:fs/promises';

const files = ['dist/browser/index.js', 'dist/browser/index.cjs'];
const forbidden = [
  ['Axios', /axios/i],
  ['Mongoose', /mongoose/i],
  ['NestJS', /@nestjs|nestjs/i],
  ['Node filesystem', /node:fs|require\(["']fs["']\)/],
  ['Node networking', /node:https?|require\(["']https?["']\)/],
  ['authorization code', /authorization/i],
  ['token configuration', /TAPIN_TOKEN|authorizationScheme/],
];

for (const file of files) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const [label, pattern] of forbidden) {
    if (pattern.test(source)) throw new Error(`${file} contains forbidden ${label} code`);
  }
}
console.log(`Verified browser isolation in ${files.join(' and ')}`);
