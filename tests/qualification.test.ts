import { describe, expect, it } from 'vitest';
import { parseQualificationVectors, qualifyVectors } from '../src/index.js';
import { field } from './fixtures/synthetic.js';
import {
  assessGsiSnapshot,
  predictC4OutcomeFromGsi,
} from '../src/gsi/index.js';

const clientSha256 = 'c'.repeat(64);
const resourceSha256 = 'd'.repeat(64);

const qualifiedIdentityField = {
  ...field,
  metadata: {
    ...field.metadata,
    sourceBuildId: '25218825',
    sourceClientSha256: clientSha256,
    resourceSha256,
    mapName: 'synthetic_room',
  },
};

const vectors = parseQualificationVectors({
  schemaVersion: 1,
  buildId: '25218825',
  clientSha256,
  resourceSha256,
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
      buildId: '25218825',
      clientSha256,
      resourceSha256,
      map: 'synthetic_room',
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

  it('preserves exact identity checks and passes an explicitly invalid native case', () => {
    const result = qualifyVectors(vectors, qualifiedIdentityField);
    expect(result.identity.matched).toBe(true);
    expect(result.status).toBe('passed');
    expect(result.totals).toEqual({
      total: 1,
      passed: 1,
      failed: 0,
      unavailable: 0,
    });
  });

  it('does not silently accept a missing client identity or native-valid case', () => {
    const mismatch = qualifyVectors(vectors, field);
    expect(mismatch.status).toBe('unavailable');
    expect(mismatch.identity.clientSha256).toBe(false);
    const validVectors = parseQualificationVectors({
      ...vectors,
      cases: [{ ...vectors.cases[0]!, nativeValid: true, nativeDamage: 42 }],
    });
    const unresolved = qualifyVectors(validVectors, qualifiedIdentityField);
    expect(unresolved.status).toBe('unavailable');
    expect(unresolved.totals.unavailable).toBe(1);
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
