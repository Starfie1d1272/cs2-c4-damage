import type { BombDamageField, Vec3 } from '../field/types.js';
import type { C4Outcome, PredictC4Input } from './types.js';
import { normalizeDirection } from './math.js';
import { finiteFloatVec, floatVec } from '../field/native-tree.js';
import {
  createStaticFieldSampler,
  type StaticFieldSampler,
} from './static-field.js';
import {
  nativeSamplePosition,
  runStaticSampling,
  type SamplingTrace,
} from './sampling.js';
import { STATIC_MODEL_REVISION } from '../model-profile.js';

export interface ConditionalScenario {
  readonly ducked: boolean;
  readonly samplePosition: Vec3;
  readonly damage: number;
  readonly hpAfter: number;
  readonly lethal: boolean;
  readonly trace: SamplingTrace;
}
export interface ConditionalOutcome {
  readonly status: 'conditional';
  readonly modelRevision: typeof STATIC_MODEL_REVISION;
  readonly evidence: 'static-reconstruction';
  /** Extrema of the listed scenarios ONLY, not bounds over missing collision/pose states. */
  readonly scope: 'listed-scenarios-only';
  readonly damage: { readonly min: number; readonly max: number };
  readonly hpAfter: { readonly min: number; readonly max: number };
  readonly lethal: boolean | 'indeterminate';
  readonly scenarios: readonly ConditionalScenario[];
  readonly assumptions: readonly string[];
  readonly unknownInputs: readonly string[];
}

function evaluate(
  sampler: StaticFieldSampler,
  input: Omit<PredictC4Input, 'field'>,
): C4Outcome {
  if (
    !input ||
    !finiteFloatVec(input.bombPosition) ||
    !finiteFloatVec(input.playerPosition) ||
    !finiteFloatVec(input.playerForward) ||
    !Number.isSafeInteger(input.health) ||
    input.health <= 0 ||
    (input.ducked !== undefined && typeof input.ducked !== 'boolean')
  )
    return { status: 'unavailable', reason: 'invalid-predict-input' };
  const normalized = normalizeDirection(input.playerForward);
  if (!normalized)
    return { status: 'unavailable', reason: 'invalid-forward-vector' };
  const needsNormalization =
    Math.abs(
      Math.hypot(
        input.playerForward.x,
        input.playerForward.y,
        input.playerForward.z,
      ) - 1,
    ) > 1e-4;
  const forward = floatVec(
    needsNormalization ? normalized : input.playerForward,
  );
  const assumptions = [
    'standard-damage-rules',
    'snapshot-is-current-and-synchronized',
    'field-matches-current-map',
    'forward-matches-native-view',
  ];
  if (needsNormalization) assumptions.push('forward-renormalized');
  const unknown = new Set<string>([
    ...sampler.identityUnknowns,
    'native-runtime-validation',
  ]);
  if (input.ducked === undefined) unknown.add('ducked');
  const scenarios: ConditionalScenario[] = [];
  const supplied = input.nativeState;
  let explicitPoint: Vec3 | undefined;
  if (supplied) {
    explicitPoint = nativeSamplePosition(supplied.sample);
    if (!explicitPoint)
      return { status: 'unavailable', reason: 'invalid-native-sample-state' };
    assumptions.push('supplied-native-state-is-current');
  } else {
    assumptions.push(
      'player-position-is-pawn-absolute-origin',
      'upright-unscaled-standard-hull',
      'standing-height-72-crouched-height-54',
    );
    unknown.add('native-sample-state');
  }
  for (const ducked of input.ducked === undefined
    ? [false, true]
    : [input.ducked]) {
    const origin = supplied?.sample.origin ?? input.playerPosition;
    const samplePosition =
      explicitPoint ??
      nativeSamplePosition({
        origin,
        collision: {
          mins: { x: -16, y: -16, z: 0 },
          maxs: { x: 16, y: 16, z: ducked ? 54 : 72 },
          scale: 1,
          orientation: { kind: 'axis-aligned' },
        },
      })!;
    if (!samplePosition)
      return { status: 'unavailable', reason: 'sample-outside-float32-domain' };
    const trace = runStaticSampling(sampler, {
      bombPosition: input.bombPosition,
      samplePosition,
      origin,
      forward,
      ducked,
      resampling: supplied?.resampling ?? { kind: 'unknown' },
    });
    if (!trace.firstField.valid)
      return { status: 'unavailable', reason: trace.firstField.reason };
    if (trace.resampling.kind === 'unknown') {
      unknown.add('ground-collision-state');
      assumptions.push('first-field-result-not-replaced-by-ground-resampling');
    }
    const damage = trace.damage ?? trace.firstPassDamage;
    if (damage === undefined)
      return { status: 'unavailable', reason: 'unresolved-sampling-result' };
    scenarios.push({
      ducked,
      samplePosition,
      damage,
      hpAfter: Math.max(0, input.health - damage),
      lethal: damage >= input.health,
      trace,
    });
  }
  const min = Math.min(...scenarios.map((s) => s.damage)),
    max = Math.max(...scenarios.map((s) => s.damage));
  return {
    status: 'conditional',
    modelRevision: STATIC_MODEL_REVISION,
    evidence: 'static-reconstruction',
    scope: 'listed-scenarios-only',
    damage: { min, max },
    hpAfter: {
      min: Math.max(0, input.health - max),
      max: Math.max(0, input.health - min),
    },
    lethal:
      min >= input.health ? true : max < input.health ? false : 'indeterminate',
    scenarios,
    assumptions: [...new Set(assumptions)],
    unknownInputs: [...unknown],
  };
}
/** Build once; owns a field snapshot. No DLLs or physics implementation are loaded. */
export function createC4Predictor(
  field: BombDamageField,
): (input: Omit<PredictC4Input, 'field'>) => C4Outcome {
  const sampler = createStaticFieldSampler(field);
  return (input) => evaluate(sampler, input);
}
export function predictStaticC4Outcome(input: PredictC4Input): C4Outcome {
  let sampler: StaticFieldSampler;
  try {
    sampler = createStaticFieldSampler(input.field);
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'invalid-static-field',
    };
  }
  return evaluate(sampler, input);
}
