#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  evaluateBakedFieldCorrection,
  parseQualificationVectors,
  predictC4Outcome,
  qualifyVectors,
} from '../index.js';
import type { Vec3 } from '../index.js';
import {
  extractField,
  readNormalizedField,
  summarizeField,
  writeNormalizedField,
} from './index.js';

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write(
    `cs2-c4-damage\n\nCommands:\n  extract --vdata <file> --compiled <file> --map <map> [--out <file>] [--build-id <id>]\n  inspect <normalized-field>\n  predict <normalized-field> --bomb-position x,y,z --player-position x,y,z --forward x,y,z --health n --ducked true|false|unknown [--sample-position x,y,z]\n  qualify <vectors.json> <normalized-field>\n`,
  );
}

function requiredOption(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--'))
    throw new Error(`missing-option:${name}`);
  return value;
}

function optionalOption(
  args: readonly string[],
  name: string,
): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

function parseVec3(value: string): Vec3 {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 3 || !parts.every(Number.isFinite))
    throw new Error(`invalid-vector:${value}`);
  return { x: parts[0]!, y: parts[1]!, z: parts[2]! };
}

function parseDucked(value: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'unknown') return undefined;
  throw new Error(`invalid-ducked:${value}`);
}

async function runExtract(args: readonly string[]): Promise<number> {
  const extractor = optionalOption(args, '--extractor');
  const extractorRevision = optionalOption(args, '--extractor-revision');
  const modelRevision = optionalOption(args, '--model-revision');
  const sourceClientSha256 = optionalOption(args, '--client-sha256');
  const field = await extractField({
    vdataPath: requiredOption(args, '--vdata'),
    compiledPath: requiredOption(args, '--compiled'),
    mapName: requiredOption(args, '--map'),
    sourceBuildId: optionalOption(args, '--build-id') ?? null,
    ...(sourceClientSha256 === undefined ? {} : { sourceClientSha256 }),
    ...(extractor === undefined ? {} : { extractor }),
    ...(extractorRevision === undefined ? {} : { extractorRevision }),
    ...(modelRevision === undefined ? {} : { modelRevision }),
  });
  const outputPath = optionalOption(args, '--out');
  if (outputPath) {
    await writeNormalizedField(outputPath, field);
    print({ output: outputPath, summary: summarizeField(field) });
  } else {
    print(field);
  }
  return 0;
}

async function runPredict(args: readonly string[]): Promise<number> {
  const field = await readNormalizedField(args[0] ?? '');
  const bombPosition = parseVec3(requiredOption(args, '--bomb-position'));
  const playerPosition = parseVec3(requiredOption(args, '--player-position'));
  const playerForward = parseVec3(requiredOption(args, '--forward'));
  const health = Number(requiredOption(args, '--health'));
  const ducked = parseDucked(requiredOption(args, '--ducked'));
  const outcome = predictC4Outcome({
    field,
    bombPosition,
    playerPosition,
    playerForward,
    ducked,
    health,
  });
  const sampleOption = optionalOption(args, '--sample-position');
  if (!sampleOption) {
    print({ outcome });
    return 0;
  }
  print({
    outcome,
    fieldOnly: evaluateBakedFieldCorrection({
      field,
      bombPosition,
      samplePosition: parseVec3(sampleOption),
      playerForward,
      ducked,
    }),
    note: 'fieldOnly is not native-query parity and is not a conservative native envelope',
  });
  return 0;
}

async function runQualify(args: readonly string[]): Promise<number> {
  const vectors = parseQualificationVectors(
    JSON.parse(await readFile(args[0] ?? '', 'utf8')),
  );
  const field = await readNormalizedField(args[1] ?? '');
  const result = qualifyVectors(vectors, field);
  print(result);
  return result.status === 'passed' ? 0 : 1;
}

export async function runCli(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const command = args[0];
  if (!command || command === '--help' || command === '-h') {
    usage();
    return 0;
  }
  const commandArgs = args.slice(1);
  if (command === 'extract') return runExtract(commandArgs);
  if (command === 'inspect') {
    const field = await readNormalizedField(commandArgs[0] ?? '');
    print(summarizeField(field));
    return 0;
  }
  if (command === 'predict') return runPredict(commandArgs);
  if (command === 'qualify') return runQualify(commandArgs);
  throw new Error(`unknown-command:${command}`);
}

function isMainModule(): boolean {
  if (typeof module !== 'undefined' && module.parent === null) return true;
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCli().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
