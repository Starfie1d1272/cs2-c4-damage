import { describe, expect, it } from 'vitest';
import {
  parseQualificationVectors,
  qualifyVectors,
  type QualificationVectors,
} from '../src/index.js';
import { field } from './fixtures/synthetic.js';
import {
  assessGsiSnapshot,
  predictC4OutcomeFromGsi,
} from '../src/gsi/index.js';

const clientSha256 = 'c'.repeat(64);
const resourceSha256 = 'd'.repeat(64);
const decompiledVdataSha256 = 'e'.repeat(64);
const normalizedFieldSha256 = 'f'.repeat(64);

const qualifiedIdentityField = {
  ...field,
  metadata: {
    ...field.metadata,
    sourceBuildId: '25218825',
    sourceClientSha256: clientSha256,
    resourceSha256,
    decompiledVdataSha256,
    normalizedFieldSha256,
    sourcePairStatus: 'unverified-source-pair' as const,
    mapName: 'synthetic_room',
  },
};

const vectors = parseQualificationVectors({
  schemaVersion: 1,
  buildId: '25218825',
  clientSha256,
  resourceSha256,
  decompiledVdataSha256,
  normalizedFieldSha256,
  sourcePairStatus: 'unverified-source-pair',
  map: 'synthetic_room',
  modelRevision: 'synthetic-unqualified-v0',
  cases: [
    {
      id: 'no-native-result',
      bombPosition: { x: 0, y: 0, z: 0 },
      playerPosition: { x: 50, y: 0, z: 0 },
      forward: { x: 1, y: 0, z: 0 },
      ducked: false,
      health: 50,
      nativeValid: false,
    },
  ],
});

describe('qualification and GSI fail-closed boundaries', () => {
  it('normalizes tuple vectors from the machine-readable JSON shape', () => {
    const parsed = parseQualificationVectors({
      schemaVersion: 1,
      buildId: '25218825',
      clientSha256,
      resourceSha256,
      decompiledVdataSha256,
      normalizedFieldSha256,
      sourcePairStatus: 'unverified-source-pair',
      map: 'synthetic_room',
      modelRevision: 'synthetic-unqualified-v0',
      cases: [
        {
          bombPosition: [0, 0, 0],
          playerPosition: [50, 0, 0],
          forward: [1, 0, 0],
          ducked: false,
          health: 50,
          nativeValid: false,
        },
      ],
    });
    expect(parsed.cases[0]?.playerPosition).toEqual({ x: 50, y: 0, z: 0 });
  });

  it('keeps negative-only evidence separate from qualification pass', () => {
    const result = qualifyVectors(vectors, qualifiedIdentityField);
    expect(result.identity.matched).toBe(true);
    expect(result.status).toBe('unavailable');
    expect(result.totals).toEqual({
      total: 1,
      passed: 0,
      failed: 0,
      unavailable: 0,
      positiveTotal: 0,
      positiveExactPassed: 0,
      negativeTotal: 1,
      negativeValidityPassed: 1,
    });
    expect(result.mismatches).toEqual([
      { index: -1, reason: 'no-native-valid-cases' },
    ]);
  });

  it('does not silently accept a missing client identity or native-valid case', () => {
    const mismatch = qualifyVectors(vectors, field);
    expect(mismatch.status).toBe('unavailable');
    expect(mismatch.identity.clientSha256).toBe(false);
    expect(mismatch.identity.decompiledVdataSha256).toBe(false);
    expect(mismatch.identity.normalizedFieldSha256).toBe(false);
    const validVectors = parseQualificationVectors({
      ...vectors,
      cases: [{ ...vectors.cases[0]!, nativeValid: true, nativeDamage: 42 }],
    });
    const unresolved = qualifyVectors(validVectors, qualifiedIdentityField);
    expect(unresolved.status).toBe('unavailable');
    expect(unresolved.totals.unavailable).toBe(1);
  });

  it('rejects missing qualification identity and keeps empty evidence unavailable', () => {
    expect(() =>
      parseQualificationVectors({
        schemaVersion: 1,
        buildId: '25218825',
        clientSha256,
        resourceSha256,
        decompiledVdataSha256,
        normalizedFieldSha256,
        sourcePairStatus: 'unverified-source-pair',
        map: 'synthetic_room',
        cases: [],
      }),
    ).toThrow('invalid-qualification-vectors');
    expect(() =>
      parseQualificationVectors({
        buildId: '25218825',
        clientSha256,
        resourceSha256,
        decompiledVdataSha256,
        normalizedFieldSha256,
        sourcePairStatus: 'unverified-source-pair',
        map: 'synthetic_room',
        modelRevision: 'synthetic-unqualified-v0',
        cases: [],
      }),
    ).toThrow('invalid-qualification-vectors');

    expect(() =>
      parseQualificationVectors({
        schemaVersion: 1,
        buildId: '25218825',
        clientSha256,
        resourceSha256,
        decompiledVdataSha256,
        normalizedFieldSha256,
        sourcePairStatus: 'unverified-source-pair',
        map: 'synthetic_room',
        modelRevision: 'synthetic-unqualified-v0',
        cases: [],
      }),
    ).toThrow('invalid-qualification-vectors');
    const emptyVectors = { ...vectors, cases: [] } as QualificationVectors;
    const result = qualifyVectors(emptyVectors, qualifiedIdentityField);
    expect(result.status).toBe('unavailable');
    expect(result.mismatches).toEqual([{ index: -1, reason: 'no-cases' }]);

    const unboundVectors = {
      ...vectors,
      modelRevision: undefined,
    } as unknown as QualificationVectors;
    const unboundResult = qualifyVectors(
      unboundVectors,
      qualifiedIdentityField,
    );
    expect(unboundResult.status).toBe('unavailable');
    expect(unboundResult.identity.modelRevision).toBe(false);
  });

  it('preserves failure reason and evidence-only native trace', () => {
    const parsed = parseQualificationVectors({
      schemaVersion: 1,
      buildId: '25218825',
      clientSha256,
      resourceSha256,
      decompiledVdataSha256,
      normalizedFieldSha256,
      sourcePairStatus: 'unverified-source-pair',
      map: 'synthetic_room',
      modelRevision: 'synthetic-unqualified-v0',
      cases: [
        {
          bombPosition: [0, 0, 0],
          playerPosition: [50, 0, 0],
          forward: [1, 0, 0],
          ducked: false,
          health: 50,
          nativeValid: false,
          nativeFailureReason: 'first-field',
          trace: {
            firstSamplePosition: [1, 2, 3],
            firstField: { valid: false },
            collision: { branchTaken: false },
            selectedStage: 'first',
          },
        },
      ],
    });
    expect(parsed.cases[0]).toMatchObject({
      nativeFailureReason: 'first-field',
      trace: {
        firstSamplePosition: { x: 1, y: 2, z: 3 },
        firstField: { valid: false },
        collision: { branchTaken: false },
        selectedStage: 'first',
      },
    });
  });

  it('keeps invalid and missing GSI values unavailable', () => {
    expect(assessGsiSnapshot({}).valid).toBe(false);
    expect(
      assessGsiSnapshot({
        bombPosition: { x: 0, y: 0, z: 0 },
        playerPosition: { x: 1, y: 1, z: 1 },
        playerForward: { x: 0, y: 0, z: 0 },
        health: 100,
      }).unknownInputs,
    ).toContain('playerForward');
    expect(
      predictC4OutcomeFromGsi(qualifiedIdentityField, {
        bombPosition: { x: 0, y: 0, z: 0 },
        playerPosition: { x: 50, y: 0, z: 0 },
        playerForward: { x: 1, y: 0, z: 0 },
        health: 50,
      }),
    ).toEqual({ status: 'unavailable', reason: 'model-not-qualified' });
  });
});
