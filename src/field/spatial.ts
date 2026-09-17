import type { BombDamageField, Bombsite, FieldRecord, Vec3 } from './types.js';

export const BOMB_SITE_EXPANSION_UNITS = 32;

export interface ExpandedBombsiteBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface NearestPosition {
  readonly positionIndex: number;
  readonly distanceSquared: number;
}

function isFiniteVec3(value: Vec3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

export function expandBombsiteBounds(site: Bombsite): ExpandedBombsiteBounds {
  return {
    min: {
      x: site.boundsMin.x - BOMB_SITE_EXPANSION_UNITS,
      y: site.boundsMin.y - BOMB_SITE_EXPANSION_UNITS,
      z: site.boundsMin.z - BOMB_SITE_EXPANSION_UNITS,
    },
    max: {
      x: site.boundsMax.x + BOMB_SITE_EXPANSION_UNITS,
      y: site.boundsMax.y + BOMB_SITE_EXPANSION_UNITS,
      z: site.boundsMax.z + BOMB_SITE_EXPANSION_UNITS,
    },
  };
}

function contains(bounds: ExpandedBombsiteBounds, point: Vec3): boolean {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z
  );
}

/** First matching site is an internal deterministic overlap policy, not native parity evidence. */
export function findBombsiteIndex(
  field: Pick<BombDamageField, 'bombsites'>,
  bombPosition: Vec3,
): number | undefined {
  if (!isFiniteVec3(bombPosition)) return undefined;
  for (let index = 0; index < field.bombsites.length; index += 1) {
    const site = field.bombsites[index];
    if (site && contains(expandBombsiteBounds(site), bombPosition))
      return index;
  }
  return undefined;
}

/** Linear 3D squared-Euclidean lookup with lower-index tie stability. */
export function findNearestPosition(
  positions: readonly Vec3[],
  point: Vec3,
): NearestPosition | undefined {
  if (!isFiniteVec3(point) || positions.length === 0) return undefined;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < positions.length; index += 1) {
    const candidate = positions[index];
    if (!candidate || !isFiniteVec3(candidate)) return undefined;
    const dx = candidate.x - point.x;
    const dy = candidate.y - point.y;
    const dz = candidate.z - point.z;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared < bestDistance) {
      bestDistance = distanceSquared;
      bestIndex = index;
    }
  }
  return bestIndex < 0
    ? undefined
    : { positionIndex: bestIndex, distanceSquared: bestDistance };
}

export function getFieldRecord(
  field: Pick<BombDamageField, 'positions' | 'records'>,
  bombsiteIndex: number,
  positionIndex: number,
): FieldRecord | undefined {
  if (
    !Number.isInteger(bombsiteIndex) ||
    bombsiteIndex < 0 ||
    !Number.isInteger(positionIndex) ||
    positionIndex < 0 ||
    positionIndex >= field.positions.length
  ) {
    return undefined;
  }
  return field.records[bombsiteIndex * field.positions.length + positionIndex];
}
