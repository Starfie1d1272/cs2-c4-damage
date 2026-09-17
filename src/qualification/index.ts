import type { BombDamageField, Vec3 } from '../field/types.js';
import { validateBombDamageField } from '../field/validation.js';
import type { C4Outcome } from '../engine/types.js';
import { predictC4Outcome } from '../engine/outcome.js';

export interface QualificationCase {
  readonly id?: string;
  readonly bombPosition: Vec3;
  readonly playerPosition: Vec3;
  readonly forward: Vec3;
  readonly ducked: boolean;
  readonly health: number;
  readonly nativeValid: boolean;
  readonly nativeDamage?: number;
}

export interface QualificationVectors {
  readonly schemaVersion?: 1;
  readonly buildId: string;
  readonly clientSha256: string;
  readonly resourceSha256: string;
  readonly map: string;
  readonly modelRevision?: string;
  readonly cases: readonly QualificationCase[];
}

export interface QualificationMismatch {
  readonly index: number;
  readonly id?: string;
  readonly reason: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface QualificationResult {
  readonly status: 'passed' | 'failed' | 'unavailable';
  readonly modelRevision: string;
  readonly identity: {
    readonly matched: boolean;
    readonly map: boolean;
    readonly buildId: boolean;
    readonly clientSha256: boolean;
    readonly resourceSha256: boolean;
    readonly modelRevision: boolean;
  };
  readonly totals: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly unavailable: number;
  };
  readonly mismatches: readonly QualificationMismatch[];
}

function validSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function validVec3(value: unknown): value is Vec3 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['x', 'y', 'z'].every(
    (key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]),
  );
}

function normalizeVec3(value: unknown): Vec3 | undefined {
  if (Array.isArray(value)) {
    if (value.length !== 3 || !value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) {
      return undefined;
    }
    return { x: value[0]!, y: value[1]!, z: value[2]! };
  }
  return validVec3(value) ? value : undefined;
}

function normalizeCase(value: unknown): QualificationCase | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<QualificationCase>;
  const bombPosition = normalizeVec3(candidate.bombPosition);
  const playerPosition = normalizeVec3(candidate.playerPosition);
  const forward = normalizeVec3(candidate.forward);
  const health = candidate.health;
  const nativeDamage = candidate.nativeDamage;
  if (
    !bombPosition ||
    !playerPosition ||
    !forward ||
    forward.x * forward.x + forward.y * forward.y + forward.z * forward.z <= 0 ||
    typeof candidate.ducked !== 'boolean' ||
    typeof health !== 'number' ||
    !Number.isSafeInteger(health) ||
    health <= 0 ||
    typeof candidate.nativeValid !== 'boolean' ||
    (candidate.id !== undefined && typeof candidate.id !== 'string') ||
    (nativeDamage !== undefined &&
      (typeof nativeDamage !== 'number' ||
        !Number.isInteger(nativeDamage) ||
        nativeDamage < 0 ||
        nativeDamage > 255)) ||
    (candidate.nativeValid && nativeDamage === undefined)
  ) {
    return undefined;
  }
  return {
    ...(candidate.id === undefined ? {} : { id: candidate.id }),
    bombPosition,
    playerPosition,
    forward,
    ducked: candidate.ducked,
    health,
    nativeValid: candidate.nativeValid,
    ...(nativeDamage === undefined ? {} : { nativeDamage }),
  };
}

export function parseQualificationVectors(value: unknown): QualificationVectors {
  if (!value || typeof value !== 'object') throw new Error('qualification-vectors-not-object');
  const candidate = value as Record<string, unknown>;
  const rawCases = candidate.cases;
  const cases = Array.isArray(rawCases) ? rawCases.map(normalizeCase) : [];
  if (
    (candidate.schemaVersion !== undefined && candidate.schemaVersion !== 1) ||
    typeof candidate.buildId !== 'string' ||
    !validSha256(candidate.clientSha256) ||
    !validSha256(candidate.resourceSha256) ||
    typeof candidate.map !== 'string' ||
    candidate.map.trim() === '' ||
    (candidate.modelRevision !== undefined &&
      (typeof candidate.modelRevision !== 'string' || candidate.modelRevision.trim() === '')) ||
    !Array.isArray(rawCases) ||
    cases.some((testCase) => testCase === undefined)
  ) {
    throw new Error('invalid-qualification-vectors');
  }
  return {
    ...(candidate.schemaVersion === undefined ? {} : { schemaVersion: candidate.schemaVersion }),
    buildId: candidate.buildId,
    clientSha256: candidate.clientSha256,
    resourceSha256: candidate.resourceSha256,
    map: candidate.map,
    ...(candidate.modelRevision === undefined ? {} : { modelRevision: candidate.modelRevision }),
    cases: cases as QualificationCase[],
  } as QualificationVectors;
}

function identityFor(
  vectors: QualificationVectors,
  field: BombDamageField,
): QualificationResult['identity'] {
  const candidate = field as Partial<BombDamageField> | null | undefined;
  const metadata =
    candidate &&
    typeof candidate === 'object' &&
    candidate.metadata &&
    typeof candidate.metadata === 'object'
      ? candidate.metadata
      : undefined;
  const expectedModelRevision =
    vectors.modelRevision ?? metadata?.modelRevision ?? 'unknown';
  const identity = {
    matched: false,
    map: metadata?.mapName === vectors.map,
    buildId: metadata?.sourceBuildId === vectors.buildId,
    clientSha256:
      metadata?.sourceClientSha256 !== undefined &&
      metadata.sourceClientSha256 !== null &&
      metadata.sourceClientSha256.toLowerCase() ===
        vectors.clientSha256.toLowerCase(),
    resourceSha256:
      metadata?.resourceSha256 !== null &&
      metadata?.resourceSha256 !== undefined &&
      metadata.resourceSha256.toLowerCase() ===
        vectors.resourceSha256.toLowerCase(),
    modelRevision: metadata?.modelRevision === expectedModelRevision,
  };
  return {
    ...identity,
    matched:
      identity.map &&
      identity.buildId &&
      identity.clientSha256 &&
      identity.resourceSha256 &&
      identity.modelRevision,
  };
}

interface QualificationComparison {
  readonly status: 'passed' | 'failed' | 'unavailable';
  readonly reason: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

function comparePrediction(
  prediction: C4Outcome,
  testCase: QualificationCase,
): QualificationComparison {
  if (prediction.status === 'unavailable') {
    return testCase.nativeValid
      ? {
          status: 'unavailable',
          reason: 'model-unavailable-for-case',
          expected: testCase.nativeDamage,
          actual: prediction,
        }
      : { status: 'passed', reason: 'native-query-unavailable' };
  }
  if (!testCase.nativeValid) {
    return {
      status: 'failed',
      reason: 'native-validity-mismatch',
      expected: false,
      actual: true,
    };
  }
  if (prediction.status === 'exact') {
    return prediction.damage === testCase.nativeDamage
      ? { status: 'passed', reason: 'exact-damage-match' }
      : {
          status: 'failed',
          reason: 'native-damage-mismatch',
          expected: testCase.nativeDamage,
          actual: prediction.damage,
        };
  }
  return {
    status: 'unavailable',
    reason: 'bounded-prediction-not-exactly-qualifying',
    expected: testCase.nativeDamage,
    actual: prediction,
  };
}

/** Compare vectors without tolerance; identity and unresolved cases never become silent passes. */
export function qualifyVectors(
  vectors: QualificationVectors,
  field: BombDamageField,
): QualificationResult {
  const candidate = field as Partial<BombDamageField> | null | undefined;
  const modelRevision =
    vectors.modelRevision ?? candidate?.metadata?.modelRevision ?? 'unknown';
  const identity = identityFor(vectors, field);
  const mismatches: QualificationMismatch[] = [];
  let passed = 0;
  let failed = 0;
  let unavailable = 0;

  if (validateBombDamageField(field).length > 0) {
    return {
      status: 'unavailable',
      modelRevision,
      identity: { ...identity, matched: false },
      totals: { total: vectors.cases.length, passed: 0, failed: 0, unavailable: vectors.cases.length },
      mismatches: [{ index: -1, reason: 'invalid-field' }],
    };
  }

  if (!identity.matched) {
    return {
      status: 'unavailable',
      modelRevision,
      identity,
      totals: { total: vectors.cases.length, passed: 0, failed: 0, unavailable: vectors.cases.length },
      mismatches: [
        {
          index: -1,
          reason: 'field-resource-identity-mismatch',
          expected: vectors,
          actual: candidate?.metadata,
        },
      ],
    };
  }

  vectors.cases.forEach((testCase, index) => {
    const prediction = predictC4Outcome({
      field,
      bombPosition: testCase.bombPosition,
      playerPosition: testCase.playerPosition,
      playerForward: testCase.forward,
      ducked: testCase.ducked,
      health: testCase.health,
    });
    const comparison = comparePrediction(prediction, testCase);
    if (comparison.status === 'passed') {
      passed += 1;
      return;
    }
    if (comparison.status === 'failed') {
      failed += 1;
      mismatches.push({
        index,
        ...(testCase.id === undefined ? {} : { id: testCase.id }),
        reason: comparison.reason,
        ...(comparison.expected === undefined ? {} : { expected: comparison.expected }),
        ...(comparison.actual === undefined ? {} : { actual: comparison.actual }),
      });
      return;
    }
    unavailable += 1;
    mismatches.push({
      index,
      ...(testCase.id === undefined ? {} : { id: testCase.id }),
      reason: comparison.reason,
      ...(comparison.expected === undefined ? {} : { expected: comparison.expected }),
      ...(comparison.actual === undefined ? {} : { actual: comparison.actual }),
    });
  });

  return {
    status: failed > 0 ? 'failed' : unavailable > 0 ? 'unavailable' : 'passed',
    modelRevision,
    identity,
    totals: { total: vectors.cases.length, passed, failed, unavailable },
    mismatches,
  };
}
