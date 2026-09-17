import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/engine/outcome.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/engine/outcome.js')>();
  return { ...actual, predictC4Outcome: vi.fn() };
});

import { predictC4Outcome } from '../src/engine/outcome.js';
import { parseQualificationVectors, qualifyVectors } from '../src/index.js';
import { field } from './fixtures/synthetic.js';

const clientSha256 = 'e'.repeat(64);
const resourceSha256 = 'f'.repeat(64);
const decompiledVdataSha256 = 'a'.repeat(64);
const normalizedFieldSha256 = 'b'.repeat(64);
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
      bombPosition: [0, 0, 0],
      playerPosition: [50, 0, 0],
      forward: [1, 0, 0],
      ducked: false,
      health: 50,
      nativeValid: true,
      nativeDamage: 42,
    },
  ],
});

describe('qualification final-output differential comparison', () => {
  it('fails an exact native-valid damage mismatch', () => {
    vi.mocked(predictC4Outcome).mockReturnValue({
      status: 'exact',
      damage: 41,
      hpAfter: 9,
      lethal: false,
    });

    const result = qualifyVectors(vectors, qualifiedIdentityField);

    expect(result.status).toBe('failed');
    expect(result.totals).toMatchObject({
      positiveTotal: 1,
      positiveExactPassed: 0,
      failed: 1,
    });
    expect(result.mismatches).toEqual([
      {
        index: 0,
        reason: 'native-damage-mismatch',
        expected: 42,
        actual: 41,
      },
    ]);
  });
});
