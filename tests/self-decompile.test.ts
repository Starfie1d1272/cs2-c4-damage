import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  extractFieldFromCompiled,
  computeNormalizedFieldSha256,
} from '../src/node/index.js';
import { parseQualificationVectors, qualifyVectors } from '../src/index.js';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
const text =
  'generic_data_type = "CS2_BOMB_DAMAGE_DATA"\nheader = { version = 2 }\ndata = { bombsites = #[ 00 00 80 BF 00 00 80 BF 00 00 80 BF 00 00 80 3F 00 00 80 3F 00 00 80 3F 00 00 00 40 ] positions = #[ 00 00 00 00 00 00 ] damage_values = #[ 01 00 00 00 ] }';
async function fixture(mutate = false) {
  const dir = await mkdtemp(join(tmpdir(), 'c4-tool-test-'));
  dirs.push(dir);
  const executable = join(dir, 'synthetic-decompiler'),
    compiled = join(dir, 'input.vdata_c');
  await writeFile(compiled, 'synthetic-compiled-marker');
  const script = `#!/usr/bin/env node\nconst fs=require('node:fs');const args=process.argv;const input=args[args.indexOf('-i')+1];const out=args[args.indexOf('-o')+1];if(fs.readFileSync(input,'utf8')!=='synthetic-compiled-marker')process.exit(2);${mutate ? "fs.writeFileSync(input,'changed');" : ''}fs.writeFileSync(out,${JSON.stringify(text)});`;
  await writeFile(executable, script, { mode: 0o755 });
  return {
    compiledPath: compiled,
    decompilerPath: executable,
    decompilerSha256: createHash('sha256').update(script).digest('hex'),
    mapName: 'synthetic_room',
    sourceClientSha256: 'a'.repeat(64),
    sourceBuildId: 'synthetic-build',
  };
}
describe('controlled decompiler source pairing', () => {
  it.skipIf(process.platform === 'win32')(
    'hashes actual generated text and binds executable identity',
    async () => {
      const options = await fixture(),
        field = await extractFieldFromCompiled(options);
      expect(field.metadata.sourcePairStatus).toBe(
        'self-decompiled-source-pair',
      );
      expect(field.metadata.decompiledVdataSha256).toBe(
        createHash('sha256').update(text).digest('hex'),
      );
      expect(field.metadata.normalizedFieldSha256).toBe(
        computeNormalizedFieldSha256(field),
      );
      expect(field.metadata.extraction.executableSha256).toBe(
        options.decompilerSha256,
      );
      const vectors = parseQualificationVectors({
        schemaVersion: 1,
        buildId: 'synthetic-build',
        clientSha256: 'a'.repeat(64),
        resourceSha256: field.metadata.resourceSha256,
        decompiledVdataSha256: field.metadata.decompiledVdataSha256,
        normalizedFieldSha256: field.metadata.normalizedFieldSha256,
        sourcePairStatus: 'self-decompiled-source-pair',
        decompilerSha256: options.decompilerSha256,
        map: 'synthetic_room',
        modelRevision: field.metadata.modelRevision,
        cases: [
          {
            bombPosition: [0, 0, 0],
            playerPosition: [0, 0, 0],
            forward: [1, 0, 0],
            ducked: false,
            health: 100,
            nativeValid: true,
            nativeDamage: 1,
          },
        ],
      });
      expect(qualifyVectors(vectors, field).identity.sourcePairStatus).toBe(
        true,
      );
      expect(
        qualifyVectors({ ...vectors, decompilerSha256: 'b'.repeat(64) }, field)
          .identity.sourcePairStatus,
      ).toBe(false);
      expect(qualifyVectors(vectors, field).status).toBe('unavailable');
      expect(() =>
        parseQualificationVectors({ ...vectors, decompilerSha256: undefined }),
      ).toThrow();
    },
  );
  it('rejects tool mismatch before executing a process', async () => {
    const options = await fixture();
    await expect(
      extractFieldFromCompiled({
        ...options,
        decompilerSha256: '0'.repeat(64),
      }),
    ).rejects.toThrow('decompiler-sha256-mismatch');
  });
  it.skipIf(process.platform === 'win32')(
    'rejects mutated input and preserves the original compiled resource',
    async () => {
      const options = await fixture(true);
      await expect(extractFieldFromCompiled(options)).rejects.toThrow(
        'decompiler-modified-compiled-input',
      );
      expect(await readFile(options.compiledPath, 'utf8')).toBe(
        'synthetic-compiled-marker',
      );
    },
  );
});
