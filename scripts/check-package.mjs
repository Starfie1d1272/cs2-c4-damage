import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { argv, execPath } from 'node:process';
import { fileURLToPath } from 'node:url';

const execFileAsync = (file, args, options) =>
  new Promise((resolvePromise, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'cs2-c4-damage-package-'));

try {
  const suppliedPackage = argv[2];
  const packResult = suppliedPackage
    ? undefined
    : await execFileAsync('pnpm', ['pack', '--pack-destination', temp], {
        cwd: root,
      });
  const packageFile =
    suppliedPackage ??
    (await readdir(temp)).find((name) => name.endsWith('.tgz'));
  assert.ok(
    packageFile,
    `pnpm pack did not create a tarball: ${packResult?.stdout}`,
  );
  const packagePath = suppliedPackage
    ? resolve(suppliedPackage)
    : join(temp, packageFile);
  const tarball = await execFileAsync('tar', ['-tzf', packagePath]);
  const entries = tarball.stdout.split('\n').filter(Boolean);
  const forbidden = entries.filter((entry) =>
    /(?:c4-damage-hud-native|authorization\.md|\.(?:vpk|dll|vdata|vdata_c)$|(?:^|\/)(?:qualification|\.agent-tmp|tmp)(?:\/|$))/i.test(
      entry,
    ),
  );
  assert.deepEqual(
    forbidden,
    [],
    `forbidden package entries: ${forbidden.join(', ')}`,
  );
  assert.ok(entries.includes('package/dist/node/cli.js'));
  assert.ok(entries.includes('package/CHANGELOG.md'));
  assert.ok(
    entries.every((entry) =>
      /^package\/(?:dist\/|package\.json$|README(?:\.zh-CN)?\.md$|CHANGELOG\.md$|LICENSE$|NOTICE$|CREDITS\.md$)/.test(
        entry,
      ),
    ),
    'package contains an unexpected file',
  );

  await writeFile(
    join(temp, 'package.json'),
    JSON.stringify({
      name: 'cs2-c4-damage-package-smoke',
      private: true,
      type: 'module',
      dependencies: { 'cs2-c4-damage': `file:${packagePath}` },
    }),
  );
  await execFileAsync('pnpm', ['install', '--ignore-workspace', '--offline'], {
    cwd: temp,
  });

  const fixture = {
    metadata: {
      formatVersion: 1,
      modelRevision: 'cs2-win64-2026-10-02-static-v2',
      sourceBuildId: null,
      resourceSha256: null,
      decompiledVdataSha256: null,
      normalizedFieldSha256: null,
      sourcePairStatus: 'unverified-source-pair',
      mapName: 'package-smoke',
      sourceResourceVersion: 1,
      extraction: { tool: 'smoke', revision: '1' },
    },
    bombsites: [
      {
        boundsMin: { x: -1, y: -1, z: -1 },
        boundsMax: { x: 1, y: 1, z: 1 },
        bombPower: 1,
      },
    ],
    positions: [{ x: 0, y: 0, z: 0 }],
    records: [{ phase: 1, yaw: 0, pitch: 0 }],
  };
  await writeFile(join(temp, 'field.json'), `${JSON.stringify(fixture)}\n`);

  await execFileAsync(
    execPath,
    [
      '--input-type=module',
      '-e',
      "import { outcomeFromDamageRange } from 'cs2-c4-damage'; import { assessGsiSnapshot } from 'cs2-c4-damage/gsi'; import { summarizeField } from 'cs2-c4-damage/node'; if (outcomeFromDamageRange(50, { min: 40, max: 60 }, ['ducked']).lethal !== 'indeterminate') throw new Error('ESM root smoke failed'); if (assessGsiSnapshot({}).ducked !== undefined) throw new Error('ESM gsi smoke failed'); if (typeof summarizeField !== 'function') throw new Error('ESM node smoke failed');",
    ],
    { cwd: temp },
  );
  for (const format of ['mjs', 'cjs']) {
    const imports =
      format === 'mjs'
        ? "import { createC4Predictor } from 'cs2-c4-damage'; import { createGsiC4Predictor, decodeGsiSnapshot } from 'cs2-c4-damage/gsi'; import { readNormalizedField } from 'cs2-c4-damage/node';"
        : "const { createC4Predictor } = require('cs2-c4-damage'); const { createGsiC4Predictor, decodeGsiSnapshot } = require('cs2-c4-damage/gsi'); const { readNormalizedField } = require('cs2-c4-damage/node');";
    const code = `${imports}
      (async () => {
        const field = await readNormalizedField('field.json');
        const snapshot = decodeGsiSnapshot({
          bomb: { state: 'planted', position: '0,0,0' },
          player: { position: '0,0,0', forward: '1,0,0', state: { health: 100 } }
        });
        const result = createGsiC4Predictor(field)(snapshot);
        if (result.status !== 'conditional' || result.scenarios.length !== 2 || result.scope !== 'listed-scenarios-only') throw new Error('GSI predictor smoke failed');
        const direct = createC4Predictor(field)({ bombPosition: snapshot.bombPosition, playerPosition: snapshot.playerPosition, playerForward: snapshot.playerForward, health: 100, ducked: false });
        if (direct.status !== 'conditional' || direct.scenarios.length !== 1) throw new Error('direct predictor smoke failed');
      })().catch((error) => { console.error(error); process.exitCode = 1; });`;
    const consumer = join(temp, `predict.${format}`);
    await writeFile(consumer, code);
    await execFileAsync(execPath, [consumer], { cwd: temp });
  }
  await execFileAsync(
    execPath,
    [
      '-e',
      "const core = require('cs2-c4-damage'); const gsi = require('cs2-c4-damage/gsi'); const node = require('cs2-c4-damage/node'); if (core.outcomeFromDamageRange(50, { min: 40, max: 60 }, ['ducked']).lethal !== 'indeterminate') throw new Error('CJS root smoke failed'); if (gsi.assessGsiSnapshot({}).ducked !== undefined) throw new Error('CJS gsi smoke failed'); if (typeof node.summarizeField !== 'function') throw new Error('CJS node smoke failed');",
    ],
    { cwd: temp },
  );
  const cli = await execFileAsync(
    'pnpm',
    ['exec', 'cs2-c4-damage', 'inspect', 'field.json'],
    {
      cwd: temp,
    },
  );
  assert.match(cli.stdout, /"positionCount": 1/);
  await readFile(packagePath);
} finally {
  await rm(temp, { recursive: true, force: true });
}
