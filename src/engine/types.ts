import type { BombDamageField, Vec3 } from '../field/types.js';

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export type C4Outcome =
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
}
