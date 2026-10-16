import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  supported: { 'template-literal': false },
  format: 'cjs',
  legalComments: 'external',
  sourcemap: false,
  write: false,
  minify: true,
});
for (const output of result.outputFiles) {
  if (process.argv.includes('--check')) {
    if (!Buffer.from(output.contents).equals(await readFile(output.path))) throw new Error('Packaged dist is stale. Run pnpm build.');
  } else {
    await mkdir('dist', { recursive: true });
    await writeFile(output.path, output.contents);
  }
}
