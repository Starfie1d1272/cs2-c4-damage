import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/engine/outcome.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/engine/outcome.js')>();
  return { ...actual, predictC4Outcome: vi.fn() };
});

import { predictC4Outcome } from '../src/engine/outcome.js';
import { parseQualificationVectors, qualifyVectors } from '../src/index.js';
import { STATIC_MODEL_REVISION } from '../src/index.js';
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
  it('keeps conditional results unresolved for native-invalid cases too', () => {
    vi.mocked(predictC4Outcome).mockReturnValue({
      status: 'conditional',
      modelRevision: STATIC_MODEL_REVISION,
      evidence: 'static-reconstruction',
      scope: 'listed-scenarios-only',
      damage: { min: 0, max: 0 },
      hpAfter: { min: 50, max: 50 },
      lethal: false,
      scenarios: [],
      assumptions: ['synthetic'],
      unknownInputs: ['ducked'],
    });
    const negative = parseQualificationVectors({
      ...vectors,
      cases: [
        { ...vectors.cases[0], nativeValid: false, nativeDamage: undefined },
      ],
    });
    const result = qualifyVectors(negative, qualifiedIdentityField);
    expect(result.status).toBe('unavailable');
    expect(result.totals.failed).toBe(0);
    expect(result.totals.unavailable).toBe(1);
  });

  it('does not turn matching failure labels into qualified native failure', () => {
    const reason = 'bomb-outside-expanded-bombsite';
    vi.mocked(predictC4Outcome).mockReturnValue({
      status: 'unavailable',
      reason,
    });
    const negative = parseQualificationVectors({
      ...vectors,
      cases: [
        {
          ...vectors.cases[0],
          nativeValid: false,
          nativeDamage: undefined,
          nativeFailureReason: reason,
        },
      ],
    });
    const result = qualifyVectors(negative, qualifiedIdentityField);
    expect(result.status).toBe('unavailable');
    expect(result.totals.negativeValidityPassed).toBe(0);
    expect(result.totals.unavailable).toBe(1);
  });

  it('does not qualify mixed evidence when a negative case is unresolved', () => {
    vi.mocked(predictC4Outcome)
      .mockReturnValueOnce({
        status: 'exact',
        damage: 42,
        hpAfter: 8,
        lethal: false,
      })
      .mockReturnValueOnce({
        status: 'unavailable',
        reason: 'model-not-qualified',
      });
    const mixed = parseQualificationVectors({
      ...vectors,
      cases: [
        vectors.cases[0],
        { ...vectors.cases[0], nativeValid: false, nativeDamage: undefined },
      ],
    });

    const result = qualifyVectors(mixed, qualifiedIdentityField);

    expect(result.status).toBe('unavailable');
    expect(result.totals).toMatchObject({
      positiveExactPassed: 1,
      negativeValidityPassed: 0,
      unavailable: 1,
    });
    expect(result.mismatches[0]).toMatchObject({
      index: 1,
      reason: 'model-unavailable-for-case',
      expected: false,
    });
  });

  it('rejects a prediction for a native query that returned false', () => {
    vi.mocked(predictC4Outcome).mockReturnValue({
      status: 'exact',
      damage: 0,
      hpAfter: 50,
      lethal: false,
    });
    const negative = parseQualificationVectors({
      ...vectors,
      cases: [
        { ...vectors.cases[0], nativeValid: false, nativeDamage: undefined },
      ],
    });
    const result = qualifyVectors(negative, qualifiedIdentityField);
    expect(result.status).toBe('failed');
    expect(result.mismatches[0]?.reason).toBe('native-validity-mismatch');
  });

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
