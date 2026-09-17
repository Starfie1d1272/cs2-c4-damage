import type { BombDamageField, Vec3 } from './types.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export class FieldValidationError extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(`Invalid bomb damage field: ${reasons.join(', ')}`);
    this.name = 'FieldValidationError';
    this.reasons = [...reasons];
  }
}

function isFiniteVec3(value: unknown): value is Vec3 {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['x', 'y', 'z'].every(
    (key) =>
      typeof candidate[key] === 'number' && Number.isFinite(candidate[key]),
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Returns every validation problem; callers must not treat a partial result as usable. */
export function validateBombDamageField(field: unknown): readonly string[] {
  const reasons: string[] = [];
  if (field === null || typeof field !== 'object') {
    return ['field-not-object'];
  }

  const candidate = field as Partial<BombDamageField>;
  const metadata = candidate.metadata;
  if (metadata === null || typeof metadata !== 'object') {
    reasons.push('missing-metadata');
  } else {
    if (metadata.formatVersion !== 1)
      reasons.push('unsupported-format-version');
    if (!isNonEmptyString(metadata.modelRevision)) {
      reasons.push('missing-model-revision');
    }
    if (
      metadata.sourceBuildId !== null &&
      !isNonEmptyString(metadata.sourceBuildId)
    ) {
      reasons.push('invalid-source-build-id');
    }
    if (
      metadata.sourceClientSha256 !== undefined &&
      metadata.sourceClientSha256 !== null &&
      (typeof metadata.sourceClientSha256 !== 'string' ||
        !SHA256_PATTERN.test(metadata.sourceClientSha256))
    ) {
      reasons.push('invalid-source-client-sha256');
    }
    if (
      metadata.resourceSha256 !== null &&
      (typeof metadata.resourceSha256 !== 'string' ||
        !SHA256_PATTERN.test(metadata.resourceSha256))
    ) {
      reasons.push('invalid-resource-sha256');
    }
    if (!isNonEmptyString(metadata.mapName)) reasons.push('missing-map-name');
    if (
      metadata.sourceResourceVersion !== 1 &&
      metadata.sourceResourceVersion !== 2
    ) {
      reasons.push('unsupported-source-resource-version');
    }
    if (
      metadata.extraction === null ||
      typeof metadata.extraction !== 'object'
    ) {
      reasons.push('missing-extraction-provenance');
    } else {
      if (!isNonEmptyString(metadata.extraction.tool)) {
        reasons.push('missing-extractor-tool');
      }
      if (!isNonEmptyString(metadata.extraction.revision)) {
        reasons.push('missing-extractor-revision');
      }
    }
  }

  const bombsites = candidate.bombsites;
  const positions = candidate.positions;
  const records = candidate.records;
  if (!Array.isArray(bombsites)) reasons.push('missing-bombsites');
  if (!Array.isArray(positions)) reasons.push('missing-positions');
  if (!Array.isArray(records)) reasons.push('missing-records');

  if (Array.isArray(bombsites)) {
    bombsites.forEach((site, index) => {
      if (site === null || typeof site !== 'object') {
        reasons.push(`bombsite-${index}-not-object`);
        return;
      }
      if (!isFiniteVec3(site.boundsMin)) {
        reasons.push(`bombsite-${index}-invalid-min`);
      }
      if (!isFiniteVec3(site.boundsMax)) {
        reasons.push(`bombsite-${index}-invalid-max`);
      }
      if (
        isFiniteVec3(site.boundsMin) &&
        isFiniteVec3(site.boundsMax) &&
        (site.boundsMin.x > site.boundsMax.x ||
          site.boundsMin.y > site.boundsMax.y ||
          site.boundsMin.z > site.boundsMax.z)
      ) {
        reasons.push(`bombsite-${index}-inverted-bounds`);
      }
      if (
        typeof site.bombPower !== 'number' ||
        !Number.isFinite(site.bombPower)
      ) {
        reasons.push(`bombsite-${index}-invalid-power`);
      }
    });
  }

  if (Array.isArray(positions)) {
    positions.forEach((position, index) => {
      if (!isFiniteVec3(position)) reasons.push(`position-${index}-invalid`);
    });
  }

  if (Array.isArray(records)) {
    records.forEach((record, index) => {
      if (record === null || typeof record !== 'object') {
        reasons.push(`record-${index}-not-object`);
        return;
      }
      if (
        !Number.isInteger(record.phase) ||
        record.phase < 0 ||
        record.phase > 0xffff
      ) {
        reasons.push(`record-${index}-invalid-phase`);
      }
      if (
        !Number.isInteger(record.yaw) ||
        record.yaw < 0 ||
        record.yaw > 0xff
      ) {
        reasons.push(`record-${index}-invalid-yaw`);
      }
      if (
        !Number.isInteger(record.pitch) ||
        record.pitch < 0 ||
        record.pitch > 0xff
      ) {
        reasons.push(`record-${index}-invalid-pitch`);
      }
    });
  }

  if (
    Array.isArray(bombsites) &&
    Array.isArray(positions) &&
    Array.isArray(records)
  ) {
    const expected = bombsites.length * positions.length;
    if (records.length !== expected) {
      reasons.push(
        `record-count-mismatch-${records.length}-expected-${expected}`,
      );
    }
  }

  return reasons;
}

export function assertValidBombDamageField(
  field: unknown,
): asserts field is BombDamageField {
  const reasons = validateBombDamageField(field);
  if (reasons.length > 0) throw new FieldValidationError(reasons);
}
