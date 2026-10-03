import {
  createStandingC4Predictor,
  type StandingC4Outcome,
} from '../engine/standing.js';
import { createC4Predictor } from '../engine/conditional.js';
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
  readonly mapName?: string;
}

/** Decoded validation and missing-state accounting; no freshness guarantee. */
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
 * complete-looking telemetry snapshot into native truth; v2 returns labeled scenarios.
 */
export function predictC4OutcomeFromGsi(
  field: BombDamageField,
  snapshot: GsiSnapshot,
): C4Outcome {
  if (
    snapshot.mapName !== undefined &&
    snapshot.mapName !== field.metadata.mapName
  )
    return { status: 'unavailable', reason: 'gsi-map-resource-mismatch' };
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

/** Decode the selected player's documented position/forward strings or numeric triples.
 * Never infers posture from an extra field. Missing values remain missing.
 */
export function decodeGsiSnapshot(
  payload: unknown,
  steamId?: string,
): GsiSnapshot {
  const object = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const vec = (v: unknown): Vec3 | undefined => {
    if (validVec3(v)) return { ...v };
    const parts = typeof v === 'string' ? v.split(',').map((s) => s.trim()) : v;
    if (
      !Array.isArray(parts) ||
      parts.length !== 3 ||
      parts.some(
        (x) => typeof x !== 'number' && (typeof x !== 'string' || x === ''),
      )
    )
      return undefined;
    const xyz = parts.map(Number);
    return xyz.every(Number.isFinite)
      ? { x: xyz[0]!, y: xyz[1]!, z: xyz[2]! }
      : undefined;
  };
  const root = object(payload),
    player = object(
      steamId === undefined ? root.player : object(root.allplayers)[steamId],
    );
  const bomb = object(root.bomb),
    health = object(player.state).health;
  const bombPosition =
    bomb.state === 'planted' || bomb.state === 'defusing'
      ? vec(bomb.position)
      : undefined;
  const playerPosition = vec(player.position),
    playerForward = vec(player.forward);
  const mapName = object(root.map).name;
  return {
    ...(bombPosition ? { bombPosition } : {}),
    ...(playerPosition ? { playerPosition } : {}),
    ...(playerForward ? { playerForward } : {}),
    ...(validHealth(health) ? { health } : {}),
    ...(typeof mapName === 'string' ? { mapName } : {}),
  };
}

/** Reuse the immutable compiled tree across GSI updates. */
export function createGsiC4Predictor(
  field: BombDamageField,
): (snapshot: GsiSnapshot) => C4Outcome {
  const predict = createC4Predictor(field),
    mapName = field.metadata.mapName;
  return (snapshot) => {
    if (snapshot.mapName !== undefined && snapshot.mapName !== mapName)
      return { status: 'unavailable', reason: 'gsi-map-resource-mismatch' };
    if (!assessGsiSnapshot(snapshot).valid)
      return { status: 'unavailable', reason: 'gsi-missing-or-invalid-input' };
    return predict({
      bombPosition: snapshot.bombPosition!,
      playerPosition: snapshot.playerPosition!,
      playerForward: snapshot.playerForward!,
      health: snapshot.health!,
      ducked: undefined,
    });
  };
}

/** HUD-friendly single standing estimate; the existing multi-scenario API is unchanged. */
export function createStandingGsiPredictor(
  field: BombDamageField,
): (snapshot: GsiSnapshot) => StandingC4Outcome {
  const predict = createStandingC4Predictor(field);
  const mapName = field.metadata.mapName;
  return (snapshot) => {
    if (snapshot.mapName !== undefined && snapshot.mapName !== mapName)
      return { status: 'unavailable', reason: 'gsi-map-resource-mismatch' };
    if (!assessGsiSnapshot(snapshot).valid)
      return { status: 'unavailable', reason: 'gsi-missing-or-invalid-input' };
    return predict({
      bombPosition: snapshot.bombPosition!,
      playerPosition: snapshot.playerPosition!,
      playerForward: snapshot.playerForward!,
      health: snapshot.health!,
    });
  };
}
