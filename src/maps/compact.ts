import type { BombDamageField } from '../field/types.js';
import { assertValidBombDamageField } from '../field/validation.js';

export interface CompactMapField {
  readonly format: 'c4-map-v1';
  readonly metadata: BombDamageField['metadata'];
  /** Consecutive min xyz, max xyz, power for each site. */
  readonly sites: readonly number[];
  readonly positions: readonly number[];
  /** Consecutive phase, yaw, pitch, in original site-major order. */
  readonly records: readonly number[];
}

export function packMapField(field: BombDamageField): CompactMapField {
  assertValidBombDamageField(field);
  return {
    format: 'c4-map-v1',
    metadata: structuredClone(field.metadata),
    sites: field.bombsites.flatMap((s) => [
      s.boundsMin.x,
      s.boundsMin.y,
      s.boundsMin.z,
      s.boundsMax.x,
      s.boundsMax.y,
      s.boundsMax.z,
      s.bombPower,
    ]),
    positions: field.positions.flatMap((p) => [p.x, p.y, p.z]),
    records: field.records.flatMap((r) => [r.phase, r.yaw, r.pitch]),
  };
}

export function unpackMapField(value: unknown): BombDamageField {
  if (!value || typeof value !== 'object')
    throw new Error('invalid-compact-map');
  const c = value as CompactMapField;
  const valid = (v: unknown, stride: number): v is readonly number[] =>
    Array.isArray(v) &&
    v.length % stride === 0 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n));
  if (
    c.format !== 'c4-map-v1' ||
    !valid(c.sites, 7) ||
    !valid(c.positions, 3) ||
    !valid(c.records, 3)
  )
    throw new Error('invalid-compact-map');
  const field: BombDamageField = {
    metadata: structuredClone(c.metadata),
    bombsites: Array.from({ length: c.sites.length / 7 }, (_, i) => {
      const p = i * 7;
      return {
        boundsMin: { x: c.sites[p]!, y: c.sites[p + 1]!, z: c.sites[p + 2]! },
        boundsMax: {
          x: c.sites[p + 3]!,
          y: c.sites[p + 4]!,
          z: c.sites[p + 5]!,
        },
        bombPower: c.sites[p + 6]!,
      };
    }),
    positions: Array.from({ length: c.positions.length / 3 }, (_, i) => ({
      x: c.positions[i * 3]!,
      y: c.positions[i * 3 + 1]!,
      z: c.positions[i * 3 + 2]!,
    })),
    records: Array.from({ length: c.records.length / 3 }, (_, i) => ({
      phase: c.records[i * 3]!,
      yaw: c.records[i * 3 + 1]!,
      pitch: c.records[i * 3 + 2]!,
    })),
  };
  assertValidBombDamageField(field);
  return field;
}
