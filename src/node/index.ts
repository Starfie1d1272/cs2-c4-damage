import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { BombDamageField } from '../field/types.js';
import {
  EXTERNAL_MODEL_REVISION,
  parseBombDamageVdata,
  type ParseBombDamageOptions,
} from '../field/parser.js';
import { assertValidBombDamageField } from '../field/validation.js';

export interface ExtractFieldOptions {
  readonly vdataPath: string;
  readonly compiledPath: string;
  readonly mapName: string;
  readonly sourceBuildId?: string | null;
  readonly sourceClientSha256?: string | null;
  readonly extractor?: string;
  readonly extractorRevision?: string;
  readonly modelRevision?: string;
}

export async function extractField(
  options: ExtractFieldOptions,
): Promise<BombDamageField> {
  const [vdataBytes, compiled] = await Promise.all([
    readFile(options.vdataPath),
    readFile(options.compiledPath),
  ]);
  const vdata = vdataBytes.toString('utf8');
  const decompiledVdataSha256 = createHash('sha256')
    .update(vdataBytes)
    .digest('hex');
  const resourceSha256 = createHash('sha256').update(compiled).digest('hex');
  const parserOptions: ParseBombDamageOptions = {
    mapName: options.mapName,
    resourceSha256,
    decompiledVdataSha256,
    sourceBuildId: options.sourceBuildId ?? null,
    ...(options.sourceClientSha256 === undefined
      ? {}
      : { sourceClientSha256: options.sourceClientSha256 }),
    extraction: {
      tool: options.extractor ?? 'cs2-c4-damage/node-extractor',
      revision: options.extractorRevision ?? '0.0.0',
    },
    modelRevision: options.modelRevision ?? EXTERNAL_MODEL_REVISION,
  };
  const field = parseBombDamageVdata(vdata, parserOptions);
  return {
    ...field,
    metadata: {
      ...field.metadata,
      normalizedFieldSha256: computeNormalizedFieldSha256(field),
    },
  };
}

/** Hash the canonical field payload without circular metadata identities. */
export function computeNormalizedFieldSha256(field: BombDamageField): string {
  assertValidBombDamageField(field);
  const payload = JSON.stringify({
    sourceResourceVersion: field.metadata.sourceResourceVersion,
    bombsites: field.bombsites,
    positions: field.positions,
    records: field.records,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export async function readNormalizedField(
  path: string,
): Promise<BombDamageField> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  assertValidBombDamageField(value);
  if (
    value.metadata.normalizedFieldSha256 !== null &&
    value.metadata.normalizedFieldSha256.toLowerCase() !==
      computeNormalizedFieldSha256(value)
  ) {
    throw new Error('normalized-field-sha256-mismatch');
  }
  return value;
}

export async function writeNormalizedField(
  path: string,
  field: BombDamageField,
): Promise<void> {
  assertValidBombDamageField(field);
  const normalizedFieldSha256 = computeNormalizedFieldSha256(field);
  if (
    field.metadata.normalizedFieldSha256 !== null &&
    field.metadata.normalizedFieldSha256.toLowerCase() !== normalizedFieldSha256
  ) {
    throw new Error('normalized-field-sha256-mismatch');
  }
  const output =
    field.metadata.normalizedFieldSha256 === null
      ? {
          ...field,
          metadata: { ...field.metadata, normalizedFieldSha256 },
        }
      : field;
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

export function summarizeField(
  field: BombDamageField,
): Record<string, unknown> {
  assertValidBombDamageField(field);
  return {
    metadata: field.metadata,
    bombsiteCount: field.bombsites.length,
    positionCount: field.positions.length,
    recordCount: field.records.length,
    expectedRecordCount: field.bombsites.length * field.positions.length,
  };
}

export interface SelfDecompileOptions extends Omit<
  ExtractFieldOptions,
  'vdataPath' | 'extractor' | 'extractorRevision'
> {
  readonly decompilerPath: string;
  /** Caller pins a trusted Source2Viewer-CLI executable, not a command string. */
  readonly decompilerSha256: string;
  readonly timeoutMs?: number;
}

/** Creates the source pair itself from an isolated compiled-input snapshot.
 * A recorded tool run establishes lineage, never native algorithm qualification.
 */
export async function extractFieldFromCompiled(
  options: SelfDecompileOptions,
): Promise<BombDamageField> {
  const [
    { execFile },
    { mkdtemp, rm },
    { tmpdir },
    { join, resolve },
    { promisify },
  ] = await Promise.all([
    import('node:child_process'),
    import('node:fs/promises'),
    import('node:os'),
    import('node:path'),
    import('node:util'),
  ]);
  if (!/^[a-f0-9]{64}$/i.test(options.decompilerSha256))
    throw new Error('invalid-decompiler-sha256');
  const tool = resolve(options.decompilerPath);
  const digest = (bytes: Uint8Array) =>
    createHash('sha256').update(bytes).digest('hex');
  const expected = options.decompilerSha256.toLowerCase();
  if (digest(await readFile(tool)) !== expected)
    throw new Error('decompiler-sha256-mismatch');
  const compiled = await readFile(options.compiledPath),
    directory = await mkdtemp(join(tmpdir(), 'cs2-c4-decompile-'));
  try {
    const input = join(directory, 'baked_bomb_damage.vdata_c'),
      output = join(directory, 'baked_bomb_damage.vdata');
    await writeFile(input, compiled);
    await promisify(execFile)(tool, ['-i', input, '-o', output, '-d'], {
      timeout: options.timeoutMs ?? 60000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    if (digest(await readFile(input)) !== digest(compiled))
      throw new Error('decompiler-modified-compiled-input');
    if (digest(await readFile(tool)) !== expected)
      throw new Error('decompiler-changed-during-run');
    const field = await extractField({
      ...options,
      compiledPath: input,
      vdataPath: output,
      extractor: 'Source2Viewer-CLI',
      extractorRevision: `sha256:${expected}`,
    });
    const result: BombDamageField = {
      ...field,
      metadata: {
        ...field.metadata,
        sourcePairStatus: 'self-decompiled-source-pair',
        extraction: {
          ...field.metadata.extraction,
          executableSha256: expected,
        },
      },
    };
    assertValidBombDamageField(result);
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export {
  loadBundledMap,
  findBundledMap,
  createBundledGsiPredictor,
} from './maps.js';
export type { BundledGsiPredictor } from './maps.js';
