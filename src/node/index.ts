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
  const [vdata, compiled] = await Promise.all([
    readFile(options.vdataPath, 'utf8'),
    readFile(options.compiledPath),
  ]);
  const resourceSha256 = createHash('sha256').update(compiled).digest('hex');
  const parserOptions: ParseBombDamageOptions = {
    mapName: options.mapName,
    resourceSha256,
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
  return parseBombDamageVdata(vdata, parserOptions);
}

export async function readNormalizedField(
  path: string,
): Promise<BombDamageField> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  assertValidBombDamageField(value);
  return value;
}

export async function writeNormalizedField(
  path: string,
  field: BombDamageField,
): Promise<void> {
  assertValidBombDamageField(field);
  await writeFile(path, `${JSON.stringify(field, null, 2)}\n`, 'utf8');
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
