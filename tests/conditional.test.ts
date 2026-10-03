import { describe, expect, it, vi } from 'vitest';
import {
  createC4Predictor,
  createStaticFieldSampler,
  nativeSamplePosition,
  runStaticSampling,
  resolveResampling,
  compareSamplingTraces,
  STATIC_MODEL_REVISION,
  STATIC_CLIENT_SHA256,
  STATIC_BUILD_ID,
  predictC4Outcome,
  lookupBakedField,
  type BombDamageField,
  type StaticFieldSampler,
} from '../src/index.js';
import {
  decodeGsiSnapshot,
  predictC4OutcomeFromGsi,
} from '../src/gsi/index.js';
import { field as base, input as oldInput } from './fixtures/synthetic.js';
const field: BombDamageField = {
  ...base,
  metadata: {
    ...base.metadata,
    modelRevision: STATIC_MODEL_REVISION,
    sourceBuildId: STATIC_BUILD_ID,
    sourceClientSha256: STATIC_CLIENT_SHA256,
  },
  bombsites: [
    {
      boundsMin: { x: -10, y: -10, z: -10 },
      boundsMax: { x: 10, y: 10, z: 10 },
      bombPower: 1000,
    },
  ],
  positions: [
    { x: 0, y: 0, z: 36 },
    { x: 0, y: 0, z: 27 },
    { x: 0, y: 0, z: -20 },
  ],
  records: [
    { phase: 1500, yaw: 0, pitch: 0 },
    { phase: 1700, yaw: 0, pitch: 0 },
    { phase: 2500, yaw: 255, pitch: 0 },
  ],
};
const origin = { x: 0, y: 0, z: 0 },
  forward = { x: 1, y: 0, z: 0 };
const input = {
  ...oldInput,
  field,
  playerPosition: origin,
  bombPosition: origin,
  playerForward: forward,
};
const sample = {
  origin,
  collision: {
    mins: { x: -16, y: -16, z: 0 },
    maxs: { x: 16, y: 16, z: 72 },
    scale: 1,
    orientation: { kind: 'axis-aligned' as const },
  },
};

describe('static model and GSI conditional outcomes', () => {
  it('produces correlated standing/crouched scenarios without claiming a native bound', () => {
    const result = predictC4Outcome(input);
    expect(result.status).toBe('conditional');
    if (result.status !== 'conditional') return;
    expect(result.scope).toBe('listed-scenarios-only');
    expect(
      result.scenarios.map((s) => [
        s.ducked,
        s.samplePosition.z,
        s.trace.firstField.valid && s.trace.firstField.positionIndex,
      ]),
    ).toEqual([
      [false, 36, 0],
      [true, 27, 1],
    ]);
    expect(result.unknownInputs).toContain('ground-collision-state');
    expect(result.scenarios[0]!.trace.damage).toBeUndefined();
    expect(result.scenarios[0]!.trace.selectedStage).toBeUndefined();
    expect(result.assumptions).toContain(
      'first-field-result-not-replaced-by-ground-resampling',
    );
  });
  it('uses supplied state and second sample without requiring live qualification first', () => {
    const result = predictC4Outcome({
      ...input,
      ducked: false,
      nativeState: { sample, resampling: { kind: 'ground-hit', groundZ: -56 } },
    });
    expect(result.status).toBe('conditional');
    if (result.status !== 'conditional') return;
    expect(result.scenarios[0]!.trace.secondSamplePosition).toEqual({
      x: 0,
      y: 0,
      z: -20,
    });
    expect(result.scenarios[0]!.trace.selectedStage).toBe('second');
    expect(result.unknownInputs).not.toContain('ground-collision-state');
    expect(result.unknownInputs).toContain('native-runtime-validation');
    expect(result.assumptions).not.toContain(
      'standing-height-72-crouched-height-54',
    );
  });
  it('retains first result after second failure but fails on first failure', () => {
    const native = createStaticFieldSampler(field),
      first = native.lookup(origin, { x: 0, y: 0, z: 36 });
    const lookup = vi
      .fn<StaticFieldSampler['lookup']>()
      .mockReturnValueOnce(first)
      .mockReturnValue({ valid: false, reason: 'synthetic-no-node' });
    const sampler = { ...native, lookup };
    const args = {
      bombPosition: origin,
      samplePosition: { x: 0, y: 0, z: 36 },
      origin,
      forward,
      ducked: false,
      resampling: { kind: 'ground-hit' as const, groundZ: -56 },
    };
    const result = runStaticSampling(sampler, args);
    expect(result.selectedStage).toBe('first');
    expect(result.damage).toBe(result.firstPassDamage);
    expect(result.secondField?.valid).toBe(false);
    const failure = runStaticSampling(sampler, args);
    expect(failure.damage).toBeUndefined();
    expect(failure.selectedStage).toBeUndefined();
    expect(lookup).toHaveBeenCalledTimes(3);
  });
  it('executes visibility then swept hull and ignores miss coordinates', () => {
    const query = vi
      .fn()
      .mockReturnValueOnce({ status: 'hit', endPosition: origin })
      .mockReturnValueOnce({
        status: 'clear',
        endPosition: { x: 0, y: 0, z: -99 },
      });
    const context = {
      eligible: true,
      origin,
      hull: { mins: { x: -16, y: -16, z: 0 }, maxs: { x: 16, y: 16, z: 72 } },
      maxCoord: 16384,
      query,
    };
    expect(
      resolveResampling({ x: 0, y: 0, z: 36 }, { x: 3, y: 4, z: 36 }, context),
    ).toEqual({ kind: 'skip', reason: 'ground-miss' });
    expect(query.mock.calls[0]![0]).toMatchObject({
      kind: 'visibility',
      collisionGroup: 3,
      masks: [1],
      shape: { kind: 'ray' },
    });
    expect(query.mock.calls[1]![0]).toMatchObject({
      kind: 'ground',
      start: origin,
      collisionGroup: 11,
      masks: [0xc3011, 0x48100, 0x40000],
      shape: { kind: 'hull' },
    });
    query.mockClear();
    expect(
      resolveResampling(origin, origin, { ...context, eligible: false }),
    ).toEqual({ kind: 'skip', reason: 'native-gate' });
    expect(query).not.toHaveBeenCalled();
  });
  it('reconstructs native center rotation and scale instead of a fixed GSI offset', () => {
    const q = Math.SQRT1_2;
    const result = nativeSamplePosition({
      origin: { x: 10, y: 20, z: 54 },
      collision: {
        mins: { x: -14, y: -12, z: 0 },
        maxs: { x: 18, y: 20, z: 72 },
        scale: 2,
        orientation: { kind: 'quaternion', x: 0, y: 0, z: q, w: q },
      },
    });
    expect(result?.x).toBeCloseTo(2, 5);
    expect(result?.y).toBeCloseTo(24, 5);
    expect(result?.z).toBe(126);
    expect(nativeSamplePosition({ origin, collision: null })).toEqual(origin);
    expect(
      nativeSamplePosition({
        ...sample,
        collision: { ...sample.collision, scale: NaN },
      }),
    ).toBeUndefined();
  });
  it('detects stage mismatches and does not pass identical incomplete traces', () => {
    const trace = runStaticSampling(createStaticFieldSampler(field), {
      bombPosition: origin,
      samplePosition: { x: 0, y: 0, z: 36 },
      origin,
      forward,
      ducked: false,
      resampling: { kind: 'ground-hit', groundZ: -56 },
    });
    expect(compareSamplingTraces(trace, trace).status).toBe('matched');
    expect(
      compareSamplingTraces(trace, {
        ...trace,
        secondSamplePosition: { x: 0, y: 0, z: -21 },
      }),
    ).toMatchObject({ status: 'mismatch' });
    expect(compareSamplingTraces({}, {}).status).toBe('incomplete');
    expect(
      compareSamplingTraces(
        { ...trace, resampling: { kind: 'unknown' } },
        { ...trace, resampling: { kind: 'unknown' } },
      ).status,
    ).toBe('incomplete');
  });
  it('rejects unsupported identities, ambiguous duplicate records and bad telemetry', () => {
    expect(
      predictC4Outcome({
        ...input,
        field: {
          ...field,
          metadata: { ...field.metadata, sourceClientSha256: 'a'.repeat(64) },
        },
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'static-client-identity-mismatch',
    });
    expect(() =>
      createStaticFieldSampler({
        ...field,
        positions: [origin, origin, origin],
      }),
    ).toThrow('ambiguous-duplicate');
    expect(
      predictC4Outcome({ ...input, playerForward: { x: 0, y: 0, z: 0 } })
        .status,
    ).toBe('unavailable');
    expect(
      predictC4Outcome({ ...input, bombPosition: { x: 1e5, y: 0, z: 0 } }),
    ).toEqual({
      status: 'unavailable',
      reason: 'bomb-outside-expanded-bombsite',
    });
  });
  it('decodes explicit player selection, planted bomb and map identity; never invents crouch', () => {
    const snapshot = decodeGsiSnapshot(
      {
        map: { name: 'synthetic_room' },
        bomb: { state: 'planted', position: '0,0,0' },
        allplayers: {
          '123': {
            position: '0,0,0',
            forward: '1,0,0',
            state: { health: 100, ducked: true },
          },
        },
      },
      '123',
    );
    const result = predictC4OutcomeFromGsi(field, snapshot);
    expect(result.status).toBe('conditional');
    if (result.status === 'conditional')
      expect(result.scenarios).toHaveLength(2);
    expect(
      predictC4OutcomeFromGsi(field, { ...snapshot, mapName: 'wrong' }).status,
    ).toBe('unavailable');
    expect(
      decodeGsiSnapshot({ bomb: { state: 'carried', position: '0,0,0' } })
        .bombPosition,
    ).toBeUndefined();
    expect(
      decodeGsiSnapshot({ bomb: { state: 'defusing', position: '1,2,3' } })
        .bombPosition,
    ).toEqual({ x: 1, y: 2, z: 3 });
    expect(
      decodeGsiSnapshot({ player: { position: '1,,2' } }).playerPosition,
    ).toBeUndefined();
  });
  it('compiled predictors snapshot mutable inputs and field-only lookup selects the new profile', () => {
    const mutable = structuredClone(field),
      predict = createC4Predictor(mutable);
    const before = predict(input);
    (mutable.positions as { x: number; y: number; z: number }[])[0]!.z = 1e4;
    expect(predict(input)).toEqual(before);
    expect(
      lookupBakedField({
        field,
        bombPosition: origin,
        samplePosition: { x: 0, y: 0, z: 36 },
      }),
    ).toMatchObject({
      status: 'resolved',
      lookupPolicy: 'native-midpoint-float32-traversal-tie',
    });
  });
});
