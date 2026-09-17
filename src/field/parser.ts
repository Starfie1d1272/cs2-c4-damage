import type {
  BombDamageField,
  FieldMetadata,
  FieldRecord,
  Vec3,
} from './types.js';
import { assertValidBombDamageField } from './validation.js';

export const EXTERNAL_MODEL_REVISION = 'external-static-v1';

export interface ParseBombDamageOptions {
  readonly mapName: string;
  readonly resourceSha256: string | null;
  readonly sourceClientSha256?: string | null;
  readonly sourceBuildId: string | null;
  readonly extraction: FieldMetadata['extraction'];
  readonly modelRevision?: string;
}

export class BombDamageParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BombDamageParseError';
    this.code = code;
  }
}

function propertyPattern(key: string): RegExp {
  return new RegExp(`(?:^|[\\s{])${key}\\s*=\\s*`, 'm');
}

function findProperty(text: string, key: string): string {
  const match = propertyPattern(key).exec(text);
  if (!match || match.index === undefined) {
    throw new BombDamageParseError(
      'missing-property',
      `Missing property: ${key}`,
    );
  }
  return text.slice(match.index + match[0].length);
}

function findBlob(text: string, key: string): string {
  const tail = findProperty(text, key);
  const opening = tail.indexOf('#[');
  if (opening < 0) {
    throw new BombDamageParseError('invalid-blob', `${key} is not a KV3 blob`);
  }
  const closing = tail.indexOf(']', opening + 2);
  if (closing < 0) {
    throw new BombDamageParseError(
      'unterminated-blob',
      `${key} blob is not closed`,
    );
  }
  return tail.slice(opening + 2, closing);
}

function parseHexBlob(body: string, key: string): Uint8Array {
  const withoutComments = body
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const tokenPattern = /0x[0-9a-f]+|[0-9a-f]+/gi;
  const tokens = [...withoutComments.matchAll(tokenPattern)];
  const residue = withoutComments
    .replace(tokenPattern, '')
    .replace(/[\s,;]+/g, '');
  if (residue.length > 0) {
    throw new BombDamageParseError(
      'invalid-hex',
      `${key} contains non-hex blob data`,
    );
  }

  const bytes: number[] = [];
  for (const tokenMatch of tokens) {
    const token = tokenMatch[0].replace(/^0x/i, '');
    if (token.length === 0 || token.length % 2 !== 0) {
      throw new BombDamageParseError(
        'invalid-hex',
        `${key} contains an odd-length hex token`,
      );
    }
    for (let offset = 0; offset < token.length; offset += 2) {
      bytes.push(Number.parseInt(token.slice(offset, offset + 2), 16));
    }
  }
  return Uint8Array.from(bytes);
}

function readVersion(text: string): 1 | 2 {
  const tail = findProperty(text, 'version');
  const match = /^\s*(\d+)/.exec(tail);
  if (!match)
    throw new BombDamageParseError(
      'invalid-version',
      'Missing numeric resource version',
    );
  const version = Number(match[1]);
  if (version !== 1 && version !== 2) {
    throw new BombDamageParseError(
      'unsupported-version',
      `Unsupported resource version: ${version}`,
    );
  }
  return version;
}

function readFloat32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getFloat32(
    offset,
    true,
  );
}

function readInt16(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getInt16(
    offset,
    true,
  );
}

function readUint16(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(
    offset,
    true,
  );
}

function readBombsites(data: Uint8Array): BombDamageField['bombsites'] {
  if (data.byteLength % 28 !== 0) {
    throw new BombDamageParseError(
      'invalid-bombsites-length',
      'bombsites length is not divisible by 28',
    );
  }
  const sites: BombDamageField['bombsites'][number][] = [];
  for (let offset = 0; offset < data.byteLength; offset += 28) {
    const site = {
      boundsMin: {
        x: readFloat32(data, offset),
        y: readFloat32(data, offset + 4),
        z: readFloat32(data, offset + 8),
      },
      boundsMax: {
        x: readFloat32(data, offset + 12),
        y: readFloat32(data, offset + 16),
        z: readFloat32(data, offset + 20),
      },
      bombPower: readFloat32(data, offset + 24),
    };
    if (
      !Object.values(site.boundsMin).every(Number.isFinite) ||
      !Object.values(site.boundsMax).every(Number.isFinite) ||
      !Number.isFinite(site.bombPower)
    ) {
      throw new BombDamageParseError(
        'nonfinite-bombsite',
        'bombsites contain a non-finite value',
      );
    }
    if (
      site.boundsMin.x > site.boundsMax.x ||
      site.boundsMin.y > site.boundsMax.y ||
      site.boundsMin.z > site.boundsMax.z
    ) {
      throw new BombDamageParseError(
        'inverted-bombsite-bounds',
        'bombsite bounds are inverted',
      );
    }
    sites.push(site);
  }
  return sites;
}

function readPositions(data: Uint8Array): readonly Vec3[] {
  if (data.byteLength % 6 !== 0) {
    throw new BombDamageParseError(
      'invalid-positions-length',
      'positions length is not divisible by 6',
    );
  }
  const positions: Vec3[] = [];
  for (let offset = 0; offset < data.byteLength; offset += 6) {
    positions.push({
      x: readInt16(data, offset),
      y: readInt16(data, offset + 2),
      z: readInt16(data, offset + 4),
    });
  }
  return positions;
}

function readRecords(data: Uint8Array): readonly FieldRecord[] {
  if (data.byteLength % 4 !== 0) {
    throw new BombDamageParseError(
      'invalid-record-length',
      'damage_values length is not divisible by 4',
    );
  }
  const records: FieldRecord[] = [];
  for (let offset = 0; offset < data.byteLength; offset += 4) {
    records.push({
      phase: readUint16(data, offset),
      yaw: data[offset + 2] ?? 0,
      pitch: data[offset + 3] ?? 0,
    });
  }
  return records;
}

function validateOptions(options: ParseBombDamageOptions): void {
  if (!options || typeof options !== 'object') {
    throw new BombDamageParseError(
      'missing-provenance',
      'Parser provenance is required',
    );
  }
  if (typeof options.mapName !== 'string' || options.mapName.trim() === '') {
    throw new BombDamageParseError('missing-map-name', 'mapName is required');
  }
  if (
    options.resourceSha256 !== null &&
    (typeof options.resourceSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(options.resourceSha256))
  ) {
    throw new BombDamageParseError(
      'invalid-resource-sha256',
      'resourceSha256 must be null or a SHA-256 hex string',
    );
  }
  if (
    options.sourceClientSha256 !== undefined &&
    options.sourceClientSha256 !== null &&
    (typeof options.sourceClientSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(options.sourceClientSha256))
  ) {
    throw new BombDamageParseError(
      'invalid-client-sha256',
      'sourceClientSha256 must be null or a SHA-256 hex string',
    );
  }
  if (
    options.sourceBuildId !== null &&
    (typeof options.sourceBuildId !== 'string' ||
      options.sourceBuildId.trim() === '')
  ) {
    throw new BombDamageParseError(
      'invalid-build-id',
      'sourceBuildId must be null or a string',
    );
  }
  if (
    !options.extraction ||
    typeof options.extraction.tool !== 'string' ||
    options.extraction.tool.trim() === '' ||
    typeof options.extraction.revision !== 'string' ||
    options.extraction.revision.trim() === ''
  ) {
    throw new BombDamageParseError(
      'missing-extraction',
      'Extractor tool and revision are required',
    );
  }
  if (
    options.modelRevision !== undefined &&
    (typeof options.modelRevision !== 'string' ||
      options.modelRevision.trim() === '')
  ) {
    throw new BombDamageParseError(
      'invalid-model-revision',
      'modelRevision must be a non-empty string',
    );
  }
}

/** Parse the text representation emitted by Source 2 Viewer for this resource. */
export function parseBombDamageVdata(
  text: string,
  options: ParseBombDamageOptions,
): BombDamageField {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new BombDamageParseError('empty-input', 'vdata input is empty');
  }
  validateOptions(options);
  if (!/generic_data_type\s*=\s*["']?CS2_BOMB_DAMAGE_DATA["']?/i.test(text)) {
    throw new BombDamageParseError(
      'wrong-data-type',
      'Input is not CS2_BOMB_DAMAGE_DATA',
    );
  }

  const sourceResourceVersion = readVersion(text);
  const bombsites = readBombsites(
    parseHexBlob(findBlob(text, 'bombsites'), 'bombsites'),
  );
  const positions = readPositions(
    parseHexBlob(findBlob(text, 'positions'), 'positions'),
  );
  const records = readRecords(
    parseHexBlob(findBlob(text, 'damage_values'), 'damage_values'),
  );
  const expectedRecords = bombsites.length * positions.length;
  if (records.length !== expectedRecords) {
    throw new BombDamageParseError(
      'record-count-mismatch',
      `damage_values contains ${records.length} records; expected ${expectedRecords}`,
    );
  }

  const field: BombDamageField = {
    metadata: {
      formatVersion: 1,
      modelRevision: options.modelRevision ?? EXTERNAL_MODEL_REVISION,
      sourceBuildId: options.sourceBuildId,
      ...(options.sourceClientSha256 === undefined
        ? {}
        : { sourceClientSha256: options.sourceClientSha256 }),
      resourceSha256: options.resourceSha256,
      mapName: options.mapName,
      sourceResourceVersion,
      extraction: {
        tool: options.extraction.tool,
        revision: options.extraction.revision,
      },
    },
    bombsites,
    positions,
    records,
  };
  assertValidBombDamageField(field);
  return field;
}
