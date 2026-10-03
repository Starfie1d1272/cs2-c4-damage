import type { Vec3 } from '../field/types.js';
import { finiteFloatVec, floatVec } from '../field/native-tree.js';
import type { StaticFieldResult, StaticFieldSampler } from './static-field.js';
import { staticPlayerDamage } from './static-math.js';
const f = Math.fround;
export interface NativeSampleState {
  readonly origin: Vec3;
  readonly collision: null | {
    readonly mins: Vec3;
    readonly maxs: Vec3;
    readonly scale: number;
    readonly orientation:
      | { readonly kind: 'axis-aligned' }
      | {
          readonly kind: 'quaternion';
          readonly x: number;
          readonly y: number;
          readonly z: number;
          readonly w: number;
        };
  };
}
/** Caller must provide the effective, up-to-date native transform. */
export function nativeSamplePosition(
  state: NativeSampleState,
): Vec3 | undefined {
  if (!state || !finiteFloatVec(state.origin)) return undefined;
  const origin = floatVec(state.origin),
    c = state.collision;
  if (c === null) return origin;
  if (
    !c ||
    !finiteFloatVec(c.mins) ||
    !finiteFloatVec(c.maxs) ||
    !Number.isFinite(f(c.scale)) ||
    c.scale <= 0 ||
    !c.orientation
  )
    return undefined;
  const keys = ['x', 'y', 'z'] as const;
  if (keys.some((k) => c.mins[k] > c.maxs[k])) return undefined;
  let v: Vec3 = {
    x: f(f(f(c.mins.x) + f(c.maxs.x)) * 0.5),
    y: f(f(f(c.mins.y) + f(c.maxs.y)) * 0.5),
    z: f(f(f(c.mins.z) + f(c.maxs.z)) * 0.5),
  };
  const q = c.orientation;
  if (q.kind === 'quaternion') {
    if (
      ![q.x, q.y, q.z, q.w].every(Number.isFinite) ||
      Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 1e-4
    )
      return undefined;
    const cross = (a: Vec3, b: Vec3): Vec3 => ({
      x: f(f(a.y * b.z) - f(a.z * b.y)),
      y: f(f(a.z * b.x) - f(a.x * b.z)),
      z: f(f(a.x * b.y) - f(a.y * b.x)),
    });
    const xyz = floatVec(q),
      cv = cross(xyz, v),
      t = { x: f(cv.x * 2), y: f(cv.y * 2), z: f(cv.z * 2) },
      ct = cross(xyz, t);
    v = {
      x: f(ct.x + f(v.x + f(f(q.w) * t.x))),
      y: f(ct.y + f(v.y + f(f(q.w) * t.y))),
      z: f(ct.z + f(v.z + f(f(q.w) * t.z))),
    };
  } else if (q.kind !== 'axis-aligned') return undefined;
  const sample = {
    x: f(origin.x + f(f(c.scale) * v.x)),
    y: f(origin.y + f(f(c.scale) * v.y)),
    z: f(origin.z + f(f(c.scale) * v.z)),
  };
  return finiteFloatVec(sample) ? sample : undefined;
}
export type ResamplingState =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'ground-hit'; readonly groundZ: number };
export interface CollisionRequest {
  readonly kind: 'visibility' | 'ground';
  readonly start: Vec3;
  readonly end: Vec3;
  readonly shape:
    | { readonly kind: 'ray' }
    | { readonly kind: 'hull'; readonly mins: Vec3; readonly maxs: Vec3 };
  readonly masks: readonly number[];
  readonly collisionGroup: number;
  /** Provider must apply native entity/owner exclusions and callback semantics for this target. */
  readonly target: 'none' | 'pawn';
}
export type CollisionResult =
  | { readonly status: 'unknown' }
  | { readonly status: 'clear' }
  | { readonly status: 'hit'; readonly endPosition: Vec3 };
export interface CollisionContext {
  readonly eligible: boolean | undefined;
  readonly origin: Vec3;
  /** Already selected normal/ducked/special native hull; never inferred from GSI. */
  readonly hull?: { readonly mins: Vec3; readonly maxs: Vec3 };
  readonly maxCoord?: number;
  readonly query?: (request: CollisionRequest) => CollisionResult;
}
/** Physics is an explicit input service; no line-trace substitute for the swept hull. */
export function resolveResampling(
  firstPoint: Vec3,
  node: Vec3,
  context: CollisionContext,
): ResamplingState {
  if (context.eligible === false)
    return { kind: 'skip', reason: 'native-gate' };
  if (
    context.eligible !== true ||
    !context.query ||
    !finiteFloatVec(context.origin)
  )
    return { kind: 'unknown' };
  const query = (request: CollisionRequest): CollisionResult => {
    try {
      return context.query!(request) ?? { status: 'unknown' };
    } catch {
      return { status: 'unknown' };
    }
  };
  const visibility = query({
    kind: 'visibility',
    start: firstPoint,
    end: node,
    shape: { kind: 'ray' },
    masks: [1],
    collisionGroup: 3,
    target: 'none',
  });
  if (visibility.status === 'clear')
    return { kind: 'skip', reason: 'visibility-clear' };
  if (
    visibility.status !== 'hit' ||
    !context.hull ||
    !finiteFloatVec(context.hull.mins) ||
    !finiteFloatVec(context.hull.maxs) ||
    !Number.isFinite(context.maxCoord) ||
    context.maxCoord! <= 0
  )
    return { kind: 'unknown' };
  if (
    ['x', 'y', 'z'].some(
      (k) =>
        context.hull!.mins[k as keyof Vec3] >
        context.hull!.maxs[k as keyof Vec3],
    )
  )
    return { kind: 'unknown' };
  const origin = floatVec(context.origin),
    length = f(f(f(context.maxCoord!) * 2) * f(Math.sqrt(3)));
  const end = { ...origin, z: f(origin.z - length) };
  if (!finiteFloatVec(end)) return { kind: 'unknown' };
  const result = query({
    kind: 'ground',
    start: origin,
    end,
    shape: {
      kind: 'hull',
      mins: floatVec(context.hull.mins),
      maxs: floatVec(context.hull.maxs),
    },
    masks: [0xc3011, 0x48100, 0x40000],
    collisionGroup: 11,
    target: 'pawn',
  });
  if (result.status === 'clear') return { kind: 'skip', reason: 'ground-miss' };
  return result.status === 'hit' && finiteFloatVec(result.endPosition)
    ? { kind: 'ground-hit', groundZ: f(result.endPosition.z) }
    : { kind: 'unknown' };
}
export interface SamplingTrace {
  readonly firstSamplePosition: Vec3;
  readonly firstField: StaticFieldResult;
  readonly resampling: ResamplingState;
  readonly secondSamplePosition?: Vec3;
  readonly secondField?: StaticFieldResult;
  readonly selectedStage?: 'first' | 'second';
  readonly damage?: number;
  readonly firstPassDamage?: number;
}
export interface SamplingInput {
  readonly bombPosition: Vec3;
  readonly samplePosition: Vec3;
  readonly origin: Vec3;
  readonly forward: Vec3;
  readonly ducked: boolean;
  readonly resampling: ResamplingState | CollisionContext;
}
export function runStaticSampling(
  sampler: StaticFieldSampler,
  input: SamplingInput,
): SamplingTrace {
  if (
    !finiteFloatVec(input.samplePosition) ||
    !finiteFloatVec(input.forward) ||
    Math.abs(
      Math.hypot(input.forward.x, input.forward.y, input.forward.z) - 1,
    ) > 1e-4 ||
    typeof input.ducked !== 'boolean'
  ) {
    return {
      firstSamplePosition: input.samplePosition,
      firstField: { valid: false, reason: 'invalid-sampling-input' },
      resampling: { kind: 'unknown' },
    };
  }
  const first = sampler.lookup(input.bombPosition, input.samplePosition);
  let resampling: ResamplingState = { kind: 'unknown' };
  if (!first.valid)
    return {
      firstSamplePosition: input.samplePosition,
      firstField: first,
      resampling,
    };
  resampling =
    'kind' in input.resampling
      ? input.resampling
      : resolveResampling(
          first.samplePosition,
          first.nodePosition,
          input.resampling,
        );
  let selected = first,
    selectedStage: 'first' | 'second' = 'first';
  let secondSamplePosition: Vec3 | undefined,
    secondField: StaticFieldResult | undefined;
  if (resampling.kind === 'ground-hit') {
    if (
      !finiteFloatVec(input.origin) ||
      !Number.isFinite(f(resampling.groundZ))
    )
      resampling = { kind: 'unknown' };
    else {
      secondSamplePosition = {
        x: first.samplePosition.x,
        y: first.samplePosition.y,
        z: f(
          f(first.samplePosition.z - f(input.origin.z)) + f(resampling.groundZ),
        ),
      };
      secondField = sampler.lookup(input.bombPosition, secondSamplePosition);
      if (secondField.valid) {
        selected = secondField;
        selectedStage = 'second';
      }
    }
  }
  return {
    firstSamplePosition: first.samplePosition,
    firstField: first,
    resampling,
    ...(secondSamplePosition
      ? { secondSamplePosition, secondField: secondField! }
      : {}),
    firstPassDamage: staticPlayerDamage(
      first.damage,
      first.blastDirection,
      input.forward,
      input.ducked,
    ),
    ...(resampling.kind === 'unknown'
      ? {}
      : {
          selectedStage,
          damage: staticPlayerDamage(
            selected.damage,
            selected.blastDirection,
            input.forward,
            input.ducked,
          ),
        }),
  };
}
