import type {
  BombDamageField,
  SourcePairStatus,
  Vec3,
} from '../field/types.js';
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
  /** Optional native evidence label for a query that returned false. */
  readonly nativeFailureReason?: string;
  /** Evidence-only trace; never used as a runtime prediction input. */
  readonly trace?: QualificationTrace;
}

export interface QualificationVectors {
  readonly schemaVersion: 1;
  readonly buildId: string;
  readonly clientSha256: string;
  readonly resourceSha256: string;
  readonly decompiledVdataSha256: string;
  readonly normalizedFieldSha256: string;
  readonly sourcePairStatus: SourcePairStatus;
  readonly map: string;
  readonly modelRevision: string;
  readonly cases: readonly QualificationCase[];
}

export interface QualificationFieldTrace {
  readonly valid: boolean;
  readonly damage?: number;
  readonly blastDirection?: Vec3;
}

export interface QualificationCollisionTrace {
  readonly branchTaken: boolean;
  readonly correctionZ?: number;
  readonly hitPosition?: Vec3;
}

export interface QualificationTrace {
  readonly firstSamplePosition?: Vec3;
  readonly firstField?: QualificationFieldTrace;
  readonly collision?: QualificationCollisionTrace;
  readonly secondSamplePosition?: Vec3;
  readonly secondField?: QualificationFieldTrace;
  readonly selectedStage?: 'first' | 'second';
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
    readonly decompiledVdataSha256: boolean;
    readonly normalizedFieldSha256: boolean;
    readonly sourcePairStatus: boolean;
    readonly modelRevision: boolean;
  };
  readonly totals: {
    readonly total: number;
    /** Positive native-valid cases with an exact damage match. */
    readonly passed: number;
    readonly failed: number;
    readonly unavailable: number;
    readonly positiveTotal: number;
    readonly positiveExactPassed: number;
    readonly negativeTotal: number;
    readonly negativeValidityPassed: number;
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

function validDamage(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  );
}

function normalizeFieldTrace(value: unknown): QualificationFieldTrace | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const blastDirection =
    candidate.blastDirection === undefined
      ? undefined
      : normalizeVec3(candidate.blastDirection);
  if (
    typeof candidate.valid !== 'boolean' ||
    (candidate.damage !== undefined && !validDamage(candidate.damage)) ||
    (candidate.blastDirection !== undefined && !blastDirection)
  ) {
    return undefined;
  }
  return {
    valid: candidate.valid,
    ...(candidate.damage === undefined ? {} : { damage: candidate.damage }),
    ...(blastDirection === undefined ? {} : { blastDirection }),
  };
}

function normalizeCollisionTrace(
  value: unknown,
): QualificationCollisionTrace | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const hitPosition =
    candidate.hitPosition === undefined
      ? undefined
      : normalizeVec3(candidate.hitPosition);
  if (
    typeof candidate.branchTaken !== 'boolean' ||
    (candidate.correctionZ !== undefined &&
      (typeof candidate.correctionZ !== 'number' ||
        !Number.isFinite(candidate.correctionZ))) ||
    (candidate.hitPosition !== undefined && !hitPosition)
  ) {
    return undefined;
  }
  return {
    branchTaken: candidate.branchTaken,
    ...(candidate.correctionZ === undefined
      ? {}
      : { correctionZ: candidate.correctionZ }),
    ...(hitPosition === undefined ? {} : { hitPosition }),
  };
}

function normalizeTrace(value: unknown): QualificationTrace | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const firstSamplePosition =
    candidate.firstSamplePosition === undefined
      ? undefined
      : normalizeVec3(candidate.firstSamplePosition);
  const firstField =
    candidate.firstField === undefined
      ? undefined
      : normalizeFieldTrace(candidate.firstField);
  const collision =
    candidate.collision === undefined
      ? undefined
      : normalizeCollisionTrace(candidate.collision);
  const secondSamplePosition =
    candidate.secondSamplePosition === undefined
      ? undefined
      : normalizeVec3(candidate.secondSamplePosition);
  const secondField =
    candidate.secondField === undefined
      ? undefined
      : normalizeFieldTrace(candidate.secondField);
  if (
    (candidate.firstSamplePosition !== undefined && !firstSamplePosition) ||
    (candidate.firstField !== undefined && !firstField) ||
    (candidate.collision !== undefined && !collision) ||
    (candidate.secondSamplePosition !== undefined && !secondSamplePosition) ||
    (candidate.secondField !== undefined && !secondField) ||
    (candidate.selectedStage !== undefined &&
      candidate.selectedStage !== 'first' &&
      candidate.selectedStage !== 'second')
  ) {
    return undefined;
  }
  return {
    ...(firstSamplePosition === undefined ? {} : { firstSamplePosition }),
    ...(firstField === undefined ? {} : { firstField }),
    ...(collision === undefined ? {} : { collision }),
    ...(secondSamplePosition === undefined ? {} : { secondSamplePosition }),
    ...(secondField === undefined ? {} : { secondField }),
    ...(candidate.selectedStage === undefined
      ? {}
      : { selectedStage: candidate.selectedStage }),
  };
}

function normalizeCase(value: unknown): QualificationCase | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<QualificationCase>;
  const bombPosition = normalizeVec3(candidate.bombPosition);
  const playerPosition = normalizeVec3(candidate.playerPosition);
  const forward = normalizeVec3(candidate.forward);
  const health = candidate.health;
  const nativeDamage = candidate.nativeDamage;
  const trace =
    candidate.trace === undefined ? undefined : normalizeTrace(candidate.trace);
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
    (nativeDamage !== undefined && !validDamage(nativeDamage)) ||
    (candidate.nativeValid && nativeDamage === undefined) ||
    (candidate.nativeFailureReason !== undefined &&
      (typeof candidate.nativeFailureReason !== 'string' ||
        candidate.nativeFailureReason.trim() === '')) ||
    (candidate.trace !== undefined && !trace)
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
    ...(candidate.nativeFailureReason === undefined
      ? {}
      : { nativeFailureReason: candidate.nativeFailureReason }),
    ...(trace === undefined ? {} : { trace }),
  };
}

export function parseQualificationVectors(value: unknown): QualificationVectors {
  if (!value || typeof value !== 'object') throw new Error('qualification-vectors-not-object');
  const candidate = value as Record<string, unknown>;
  const rawCases = candidate.cases;
  const cases = Array.isArray(rawCases) ? rawCases.map(normalizeCase) : [];
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.buildId !== 'string' ||
    !validSha256(candidate.clientSha256) ||
    !validSha256(candidate.resourceSha256) ||
    !validSha256(candidate.decompiledVdataSha256) ||
    !validSha256(candidate.normalizedFieldSha256) ||
    candidate.sourcePairStatus !== 'unverified-source-pair' ||
    typeof candidate.map !== 'string' ||
    candidate.map.trim() === '' ||
    typeof candidate.modelRevision !== 'string' ||
    candidate.modelRevision.trim() === '' ||
    !Array.isArray(rawCases) ||
    cases.length === 0 ||
    cases.some((testCase) => testCase === undefined)
  ) {
    throw new Error('invalid-qualification-vectors');
  }
  return {
    schemaVersion: 1,
    buildId: candidate.buildId,
    clientSha256: candidate.clientSha256,
    resourceSha256: candidate.resourceSha256,
    decompiledVdataSha256: candidate.decompiledVdataSha256,
    normalizedFieldSha256: candidate.normalizedFieldSha256,
    sourcePairStatus: candidate.sourcePairStatus,
    map: candidate.map,
    modelRevision: candidate.modelRevision,
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
    typeof vectors.modelRevision === 'string'
      ? vectors.modelRevision
      : '__missing-model-revision__';
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
    decompiledVdataSha256:
      metadata?.decompiledVdataSha256 !== null &&
      metadata?.decompiledVdataSha256 !== undefined &&
      metadata.decompiledVdataSha256.toLowerCase() ===
        vectors.decompiledVdataSha256.toLowerCase(),
    normalizedFieldSha256:
      metadata?.normalizedFieldSha256 !== null &&
      metadata?.normalizedFieldSha256 !== undefined &&
      metadata.normalizedFieldSha256.toLowerCase() ===
        vectors.normalizedFieldSha256.toLowerCase(),
    sourcePairStatus: metadata?.sourcePairStatus === vectors.sourcePairStatus,
    modelRevision: metadata?.modelRevision === expectedModelRevision,
  };
  return {
    ...identity,
    matched:
      identity.map &&
      identity.buildId &&
      identity.clientSha256 &&
      identity.resourceSha256 &&
      identity.decompiledVdataSha256 &&
      identity.normalizedFieldSha256 &&
      identity.sourcePairStatus &&
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

function emptyTotals(cases: readonly QualificationCase[]): QualificationResult['totals'] {
  const positiveTotal = cases.filter((testCase) => testCase.nativeValid).length;
  return {
    total: cases.length,
    passed: 0,
    failed: 0,
    unavailable: 0,
    positiveTotal,
    positiveExactPassed: 0,
    negativeTotal: cases.length - positiveTotal,
    negativeValidityPassed: 0,
  };
}

/** Compare vectors without tolerance; identity and unresolved cases never become silent passes. */
export function qualifyVectors(
  vectors: QualificationVectors,
  field: BombDamageField,
): QualificationResult {
  const candidate = field as Partial<BombDamageField> | null | undefined;
  const modelRevision =
    typeof vectors.modelRevision === 'string'
      ? vectors.modelRevision
      : 'unknown';
  const identity = identityFor(vectors, field);
  const mismatches: QualificationMismatch[] = [];
  const positiveTotal = vectors.cases.filter(
    (testCase) => testCase.nativeValid,
  ).length;
  const negativeTotal = vectors.cases.length - positiveTotal;
  let passed = 0;
  let positiveExactPassed = 0;
  let negativeValidityPassed = 0;
  let failed = 0;
  let unavailable = 0;

  if (validateBombDamageField(field).length > 0) {
    return {
      status: 'unavailable',
      modelRevision,
      identity: { ...identity, matched: false },
      totals: {
        ...emptyTotals(vectors.cases),
        unavailable: vectors.cases.length,
      },
      mismatches: [{ index: -1, reason: 'invalid-field' }],
    };
  }

  if (vectors.cases.length === 0) {
    return {
      status: 'unavailable',
      modelRevision,
      identity: { ...identity, matched: false },
      totals: emptyTotals(vectors.cases),
      mismatches: [{ index: -1, reason: 'no-cases' }],
    };
  }

  if (!identity.matched) {
    return {
      status: 'unavailable',
      modelRevision,
      identity,
      totals: {
        ...emptyTotals(vectors.cases),
        unavailable: vectors.cases.length,
      },
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
      if (testCase.nativeValid) {
        passed += 1;
        positiveExactPassed += 1;
      } else {
        negativeValidityPassed += 1;
      }
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

  if (positiveTotal === 0 && failed === 0 && unavailable === 0) {
    mismatches.push({ index: -1, reason: 'no-native-valid-cases' });
  }

  return {
    status:
      failed > 0
        ? 'failed'
        : positiveTotal === 0 || unavailable > 0
          ? 'unavailable'
          : 'passed',
    modelRevision,
    identity,
    totals: {
      total: vectors.cases.length,
      passed,
      failed,
      unavailable,
      positiveTotal,
      positiveExactPassed,
      negativeTotal,
      negativeValidityPassed,
    },
    mismatches,
  };
}
