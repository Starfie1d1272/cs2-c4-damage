import type { FieldRecord, Vec3 } from '../field/types.js';

export const MAX_C4_DAMAGE = 255;
export const MAX_FIELD_DAMAGE = 100;
export const MAX_PHASE = 1800;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Implements the documented baked-field Phase/BombPower conversion. */
export function calculateRawFieldDamage(
  bombPower: number,
  record: Pick<FieldRecord, 'phase'>,
): number {
  const phase = record.phase;
  const clampedPhase = Math.min(phase, MAX_PHASE);
  if (phase === 0) return phase >= bombPower ? 0 : MAX_FIELD_DAMAGE;
  const damage =
    MAX_FIELD_DAMAGE - (MAX_FIELD_DAMAGE * (phase - bombPower)) / clampedPhase;
  return clamp(damage, 0, MAX_C4_DAMAGE);
}

/** Native field output is integerized before the player-specific correction path. */
export function integerizeDamage(damage: number): number {
  return clamp(Math.trunc(damage), 0, MAX_C4_DAMAGE);
}

/** Decode the report's Z(yaw) * Y(pitch) rotation applied to UnitX. */
export function decodeBlastDirection(yaw: number, pitch: number): Vec3 {
  const yawRadians = (Math.PI * 2 * yaw) / 256;
  const pitchRadians = (Math.PI * 2 * pitch) / 256;
  const cosPitch = Math.cos(pitchRadians);
  return {
    x: Math.cos(yawRadians) * cosPitch,
    y: Math.sin(yawRadians) * cosPitch,
    z: -Math.sin(pitchRadians),
  };
}

export function bias(x: number, parameter: number): number {
  return x / ((1 / parameter - 2) * (1 - x) + 1);
}

/** Scale is intentionally truncation after the nonlinear Bias calculation. */
export function scaleDamage(damage: number, parameter: number): number {
  return integerizeDamage(100 * bias(damage / 100, parameter));
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function validDirection(value: Vec3): boolean {
  const lengthSquared = dot(value, value);
  return Number.isFinite(lengthSquared) && lengthSquared > 0;
}

/** Apply only the statically documented player stance/facing correction. */
export function applyPlayerCorrections(
  rawDamage: number,
  blastDirection: Vec3,
  playerForward: Vec3,
  ducked: boolean,
): number | undefined {
  if (!validDirection(blastDirection) || !validDirection(playerForward))
    return undefined;
  let damage = integerizeDamage(rawDamage);
  if (damage >= 100) return damage;
  if (ducked) damage = scaleDamage(damage, 0.45);
  const facing = clamp((dot(blastDirection, playerForward) + 1) / 2, 0, 1);
  return scaleDamage(damage, 0.53 - 0.06 * facing);
}

export function correctionRangeForDucked(
  rawDamage: number,
  blastDirection: Vec3,
  playerForward: Vec3,
  ducked: boolean | undefined,
):
  | {
      readonly min: number;
      readonly max: number;
      readonly unknownInputs: readonly string[];
    }
  | undefined {
  if (ducked !== undefined) {
    const damage = applyPlayerCorrections(
      rawDamage,
      blastDirection,
      playerForward,
      ducked,
    );
    return damage === undefined
      ? undefined
      : { min: damage, max: damage, unknownInputs: [] };
  }
  const standing = applyPlayerCorrections(
    rawDamage,
    blastDirection,
    playerForward,
    false,
  );
  const crouched = applyPlayerCorrections(
    rawDamage,
    blastDirection,
    playerForward,
    true,
  );
  if (standing === undefined || crouched === undefined) return undefined;
  return {
    min: Math.min(standing, crouched),
    max: Math.max(standing, crouched),
    unknownInputs: ['ducked'],
  };
}
