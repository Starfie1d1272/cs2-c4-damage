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
