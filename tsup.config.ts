import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', gsi: 'src/gsi/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',
  splitting: false,
});
