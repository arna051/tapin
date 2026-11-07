import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/browser/index.ts',
    'src/node/index.ts',
    'src/mongoose/index.ts',
    'src/nestjs/index.ts',
    'src/testing/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'node18',
  outDir: 'dist',
  external: ['mongoose', '@nestjs/common', 'rxjs'],
});
