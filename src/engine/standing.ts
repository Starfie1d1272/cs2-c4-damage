import type { BombDamageField } from '../field/types.js';
import type { PredictC4Input } from './types.js';
import { createC4Predictor } from './conditional.js';

export type StandingC4Outcome =
  | {
      readonly status: 'predicted';
      readonly stance: 'standing';
      readonly damage: number;
      readonly hpAfter: number;
      readonly lethal: boolean;
      readonly modelRevision: string;
      readonly assumptions: readonly string[];
      readonly unknownInputs: readonly string[];
    }
  | { readonly status: 'unavailable'; readonly reason: string };
export type StandingC4Input = Omit<PredictC4Input, 'field' | 'ducked'>;

/** Product policy: evaluate the standing scenario, regardless of actual posture. */
export function createStandingC4Predictor(
  field: BombDamageField,
): (input: StandingC4Input) => StandingC4Outcome {
  const predict = createC4Predictor(field);
  return (input) => {
    const result = predict({ ...input, ducked: false });
    if (result.status === 'unavailable') return result;
    if (result.status !== 'conditional')
      return { status: 'unavailable', reason: 'unsupported-standing-result' };
    const scenario = result.scenarios[0]!;
    return {
      status: 'predicted',
      stance: 'standing',
      damage: scenario.damage,
      hpAfter: scenario.hpAfter,
      lethal: scenario.lethal,
      modelRevision: result.modelRevision,
      assumptions: result.assumptions,
      unknownInputs: result.unknownInputs,
    };
  };
}
