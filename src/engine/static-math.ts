import { finiteFloatVec } from '../field/native-tree.js';
import type { Vec3 } from '../field/types.js';
const f = Math.fround;
const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

/** CVTTSS2SI returns INT_MIN for overflow/NaN before the native clamp. */
export function nativeDamageByte(value: number): number {
  const x = f(value);
  return !Number.isFinite(x) || x >= 2147483648 || x < -2147483648
    ? 0
    : clamp(Math.trunc(x), 0, 255);
}
export function staticRawFieldValue(power: number, phase: number): number {
  if (
    !Number.isFinite(f(power)) ||
    !Number.isInteger(phase) ||
    phase < 0 ||
    phase > 65535
  )
    throw new Error('invalid-static-field-value');
  const p = f(power),
    end = f(p + Math.min(1800, phase));
  const raw =
    p === end
      ? f(phase - end) < 0
        ? 100
        : 0
      : f(f(f(f(phase - p) * -100) / f(end - p)) + 100);
  return raw;
}
export function staticRawDamage(power: number, phase: number): number {
  return nativeDamageByte(staticRawFieldValue(power, phase));
}
export function staticScaleDamage(damage: number, parameter: number): number {
  if (
    !Number.isInteger(damage) ||
    damage < 0 ||
    damage > 255 ||
    !Number.isFinite(parameter) ||
    parameter <= 0 ||
    parameter > 1
  )
    throw new Error('invalid-static-bias-input');
  const x = clamp(f(damage / 100), 0, 1),
    b = clamp(f(parameter), 1.1754943508222875e-38, 1);
  return nativeDamageByte(f(f(x / f(f(f(f(1 / b) - 2) * f(1 - x)) + 1)) * 100));
}
export function staticBlastDirection(yaw: number, pitch: number): Vec3 {
  if (![yaw, pitch].every((x) => Number.isInteger(x) && x >= 0 && x <= 255))
    throw new Error('invalid-direction-byte');
  const radians = (byte: number) =>
    f(f(f(byte / 255) * 360) * f(Math.PI / 180));
  const y = radians(yaw),
    p = radians(pitch);
  const cy = f(Math.cos(y)),
    sy = f(Math.sin(y)),
    cp = f(Math.cos(p)),
    sp = f(Math.sin(p));
  return { x: f(cy * cp), y: f(sy * cp), z: -sp };
}
/** forward is a native-equivalent unit direction; unlike the old helper this does not renormalize it. */
export function staticPlayerDamage(
  raw: number,
  direction: Vec3,
  forward: Vec3,
  ducked: boolean,
): number {
  if (
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw > 255 ||
    typeof ducked !== 'boolean' ||
    !finiteFloatVec(direction) ||
    !finiteFloatVec(forward) ||
    Math.abs(Math.hypot(forward.x, forward.y, forward.z) - 1) > 1e-4
  )
    throw new Error('invalid-static-player-input');
  if (raw >= 100) return raw;
  const damage = ducked ? staticScaleDamage(raw, f(0.45)) : raw;
  const dot = f(
    f(f(direction.z * f(forward.z)) + f(direction.y * f(forward.y))) +
      f(direction.x * f(forward.x)),
  );
  const t = clamp(f(f(dot + 1) * 0.5), 0, 1);
  const b = f(f(0.53) - f(t * f(0.0599999725818634)));
  return staticScaleDamage(damage, b);
}
