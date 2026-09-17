import type { C4Outcome, NumericRange, PredictC4Input } from './types.js';

/**
 * Arithmetic only: the caller must establish a conservative integer damage envelope.
 * Does not derive or qualify that envelope against CS2. Never promotes it to exact.
 * Assumes a living player and standard damage rules (no invulnerability/modifiers).
 */
export function outcomeFromDamageRange(
  health: number,
  damage: NumericRange,
  unknownInputs: readonly string[],
): C4Outcome {
  if (
    !Number.isSafeInteger(health) ||
    health <= 0 ||
    !Number.isInteger(damage.min) ||
    !Number.isInteger(damage.max) ||
    damage.min < 0 ||
    damage.max > 255 ||
    damage.min > damage.max
  ) {
    return { status: 'unavailable', reason: 'invalid-health-or-damage-range' };
  }
  return {
    status: 'bounded',
    damage: { min: damage.min, max: damage.max },
    hpAfter: {
      min: Math.max(0, health - damage.max),
      max: Math.max(0, health - damage.min),
    },
    lethal:
      damage.min >= health
        ? true
        : damage.max < health
          ? false
          : 'indeterminate',
    unknownInputs: [...unknownInputs],
  };
}

/** Deliberate fail-closed foundation: no model/resource pair is qualified yet. */
export function predictC4Outcome(input: PredictC4Input): C4Outcome {
  void input;
  return { status: 'unavailable', reason: 'model-not-qualified' };
}
