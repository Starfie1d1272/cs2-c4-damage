import type { Vec3 } from '../field/types.js';
import type { BombDamageField } from '../field/types.js';
import type { C4Outcome } from '../engine/types.js';
import { predictC4Outcome } from '../engine/outcome.js';
import { normalizeDirection } from '../engine/math.js';

/** Already decoded GSI-like snapshot; not Valve wire JSON or a complete GSI schema. */
export interface GsiSnapshot {
  readonly bombPosition?: Vec3;
  readonly playerPosition?: Vec3;
  readonly playerForward?: Vec3;
  readonly health?: number;
}

/** Adapter boundary only. Wire parsing, freshness and prediction are deferred. */
export interface GsiAssessment {
  readonly snapshot: GsiSnapshot;
  readonly ducked: undefined;
  readonly valid: boolean;
  readonly unknownInputs: readonly string[];
}

function validVec3(value: unknown): value is Vec3 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['x', 'y', 'z'].every(
    (key) =>
      typeof candidate[key] === 'number' && Number.isFinite(candidate[key]),
  );
}

function validForward(value: unknown): value is Vec3 {
  return validVec3(value) && normalizeDirection(value) !== undefined;
}

function validHealth(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Records native gaps even when every exposed telemetry field is present. */
export function assessGsiSnapshot(snapshot: GsiSnapshot): GsiAssessment {
  const missing: string[] = [];
  if (!validVec3(snapshot.bombPosition)) missing.push('bombPosition');
  if (!validVec3(snapshot.playerPosition)) missing.push('playerPosition');
  if (!validForward(snapshot.playerForward)) missing.push('playerForward');
  if (!validHealth(snapshot.health)) missing.push('health');
  return {
    snapshot,
    ducked: undefined,
    valid: missing.length === 0,
    unknownInputs: [
      ...missing,
      'ducked',
      'native-sample-point',
      'ground-collision-correction',
      'native-second-sample-selection',
    ],
  };
}

/**
 * GSI cannot supply the native pawn sample/collision inputs. It therefore never turns a
 * complete-looking telemetry snapshot into a guessed prediction.
 */
export function predictC4OutcomeFromGsi(
  field: BombDamageField,
  snapshot: GsiSnapshot,
): C4Outcome {
  const assessment = assessGsiSnapshot(snapshot);
  if (!assessment.valid)
    return { status: 'unavailable', reason: 'gsi-missing-or-invalid-input' };
  return predictC4Outcome({
    field,
    bombPosition: snapshot.bombPosition!,
    playerPosition: snapshot.playerPosition!,
    playerForward: snapshot.playerForward!,
    ducked: undefined,
    health: snapshot.health!,
  });
}

export const predictGsiC4Outcome = predictC4OutcomeFromGsi;
