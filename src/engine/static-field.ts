import type { BombDamageField, Vec3 } from '../field/types.js';
import { assertValidBombDamageField } from '../field/validation.js';
import {
  createNativeTree,
  finiteFloatVec,
  floatVec,
} from '../field/native-tree.js';
import { staticBlastDirection, staticRawDamage } from './static-math.js';
import {
  STATIC_MODEL_REVISION,
  STATIC_CLIENT_SHA256,
  STATIC_BUILD_ID,
} from '../model-profile.js';

export interface StaticFieldHit {
  readonly valid: true;
  readonly positionIndex: number;
  readonly bombsiteIndex: number;
  readonly distanceSquared: number;
  readonly samplePosition: Vec3;
  readonly nodePosition: Vec3;
  readonly damage: number;
  readonly blastDirection: Vec3;
}
export type StaticFieldResult =
  StaticFieldHit | { readonly valid: false; readonly reason: string };
export interface StaticFieldSampler {
  readonly modelRevision: typeof STATIC_MODEL_REVISION;
  readonly identityUnknowns: readonly string[];
  lookup(bombPosition: Vec3, samplePosition: Vec3): StaticFieldResult;
}

/** Compile once for repeated predictions. The sampler owns copies, not mutable caller data. */
export function createStaticFieldSampler(
  field: BombDamageField,
): StaticFieldSampler {
  assertValidBombDamageField(field);
  const meta = field.metadata;
  if (meta.modelRevision !== STATIC_MODEL_REVISION)
    throw new Error('unsupported-static-model-revision');
  if (
    meta.sourceClientSha256 &&
    meta.sourceClientSha256.toLowerCase() !== STATIC_CLIENT_SHA256
  )
    throw new Error('static-client-identity-mismatch');
  if (meta.sourceBuildId && meta.sourceBuildId !== STATIC_BUILD_ID)
    throw new Error('static-build-identity-mismatch');
  const positions = field.positions.map(floatVec),
    records = field.records.map((r) => ({ ...r }));
  // Native coordinate-to-record lookup for conflicting duplicates is not established.
  const unique = new Set(positions.map((p) => `${p.x},${p.y},${p.z}`));
  if (unique.size !== positions.length)
    throw new Error('ambiguous-duplicate-field-positions');
  const tree = createNativeTree(positions);
  const f = Math.fround;
  const sites = field.bombsites.map((s) => ({
    min: {
      x: f(f(s.boundsMin.x) - 32),
      y: f(f(s.boundsMin.y) - 32),
      z: f(f(s.boundsMin.z) - 32),
    },
    max: {
      x: f(f(s.boundsMax.x) + 32),
      y: f(f(s.boundsMax.y) + 32),
      z: f(f(s.boundsMax.z) + 32),
    },
    power: f(s.bombPower),
  }));
  if (
    sites.some(
      (s) =>
        !finiteFloatVec(s.min) ||
        !finiteFloatVec(s.max) ||
        !Number.isFinite(s.power),
    )
  )
    throw new Error('field-outside-float32-domain');
  const identityUnknowns = [
    ...(!meta.sourceClientSha256 ? ['source-client-identity'] : []),
    ...(!meta.sourceBuildId ? ['source-build-identity'] : []),
    ...(!meta.resourceSha256 ? ['source-resource-identity'] : []),
    ...(meta.sourcePairStatus === 'unverified-source-pair'
      ? ['source-pair']
      : []),
  ];
  return {
    modelRevision: STATIC_MODEL_REVISION,
    identityUnknowns: Object.freeze(identityUnknowns),
    lookup(bombPosition, samplePosition) {
      if (!finiteFloatVec(bombPosition) || !finiteFloatVec(samplePosition))
        return { valid: false, reason: 'invalid-static-position' };
      const b = floatVec(bombPosition),
        p = floatVec(samplePosition);
      const siteIndex = sites.findIndex(
        (s) =>
          b.x >= s.min.x &&
          b.x <= s.max.x &&
          b.y >= s.min.y &&
          b.y <= s.max.y &&
          b.z >= s.min.z &&
          b.z <= s.max.z,
      );
      if (siteIndex < 0)
        return { valid: false, reason: 'bomb-outside-expanded-bombsite' };
      const nearest = tree.nearest(p);
      if (!nearest)
        return { valid: false, reason: 'field-has-no-nearest-position' };
      const record =
        records[siteIndex * positions.length + nearest.positionIndex]!;
      return {
        valid: true,
        ...nearest,
        bombsiteIndex: siteIndex,
        samplePosition: p,
        nodePosition: { ...positions[nearest.positionIndex]! },
        damage: staticRawDamage(sites[siteIndex]!.power, record.phase),
        blastDirection: staticBlastDirection(record.yaw, record.pitch),
      };
    },
  };
}
