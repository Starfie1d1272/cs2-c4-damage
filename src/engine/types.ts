import type { BombDamageField, Vec3 } from '../field/types.js';

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export type C4Outcome =
  | import('./conditional.js').ConditionalOutcome
  | {
      readonly status: 'exact';
      readonly damage: number;
      readonly hpAfter: number;
      readonly lethal: boolean;
    }
  | {
      readonly status: 'bounded';
      readonly damage: NumericRange;
      readonly hpAfter: NumericRange;
      readonly lethal: boolean | 'indeterminate';
      readonly unknownInputs: readonly string[];
    }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface PredictC4Input {
  readonly field: BombDamageField;
  readonly bombPosition: Vec3;
  readonly playerPosition: Vec3;
  readonly playerForward: Vec3;
  /** undefined means unknown, never standing. */
  readonly ducked: boolean | undefined;
  readonly health: number;
  /** Optional independently supplied native state; GSI alone does not establish it. */
  readonly nativeState?: {
    readonly sample: import('./sampling.js').NativeSampleState;
    readonly resampling:
      | import('./sampling.js').ResamplingState
      | import('./sampling.js').CollisionContext;
  };
}
