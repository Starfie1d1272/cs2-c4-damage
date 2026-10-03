import { STATIC_MODEL_REVISION } from '../model-profile.js';
import { createStaticFieldSampler } from './static-field.js';
import { staticPlayerDamage, staticRawFieldValue } from './static-math.js';
import { normalizeDirection } from './math.js';
import { floatVec } from '../field/native-tree.js';
import type { BombDamageField, FieldRecord, Vec3 } from '../field/types.js';
import {
  findBombsiteIndex,
  findNearestPosition,
  getFieldRecord,
} from '../field/spatial.js';
import {
  applyPlayerCorrections,
  calculateRawFieldDamage,
  correctionRangeForDucked,
  decodeBlastDirection,
  integerizeDamage,
} from './math.js';

export interface BakedFieldLookupInput {
  readonly field: BombDamageField;
  readonly bombPosition: Vec3;
  /** Must be an independently established native sample point; playerPosition is not substituted. */
  readonly samplePosition: Vec3;
}

export type BakedFieldLookup =
  | {
      readonly status: 'resolved';
      readonly bombsiteIndex: number;
      readonly positionIndex: number;
      readonly distanceSquared: number;
      readonly rawDamage: number;
      readonly integerDamage: number;
      readonly blastDirection: Vec3;
      readonly record: FieldRecord;
      readonly lookupPolicy:
        | 'linear-squared-euclidean-lower-index-tie'
        | 'native-midpoint-float32-traversal-tie';
      readonly overlapPolicy: 'first-expanded-aabb-match';
    }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface BakedFieldCorrectionInput extends BakedFieldLookupInput {
  readonly playerForward: Vec3;
  readonly ducked: boolean | undefined;
}

export type BakedFieldCorrection =
  | (Extract<BakedFieldLookup, { status: 'resolved' }> & {
      readonly damage: { readonly min: number; readonly max: number };
      readonly unknownInputs: readonly string[];
      readonly qualification: 'field-only-not-native-qualified';
    })
  | { readonly status: 'unavailable'; readonly reason: string };

function lookupField(input: BakedFieldLookupInput): BakedFieldLookup {
  if (input.field?.metadata?.modelRevision === STATIC_MODEL_REVISION) {
    try {
      const result = createStaticFieldSampler(input.field).lookup(
        input.bombPosition,
        input.samplePosition,
      );
      if (!result.valid)
        return { status: 'unavailable', reason: result.reason };
      const record =
        input.field.records[
          result.bombsiteIndex * input.field.positions.length +
            result.positionIndex
        ]!;
      return {
        status: 'resolved',
        bombsiteIndex: result.bombsiteIndex,
        positionIndex: result.positionIndex,
        distanceSquared: result.distanceSquared,
        rawDamage: staticRawFieldValue(
          input.field.bombsites[result.bombsiteIndex]!.bombPower,
          record.phase,
        ),
        integerDamage: result.damage,
        blastDirection: result.blastDirection,
        record,
        lookupPolicy: 'native-midpoint-float32-traversal-tie',
        overlapPolicy: 'first-expanded-aabb-match',
      };
    } catch (error) {
      return {
        status: 'unavailable',
        reason: error instanceof Error ? error.message : 'invalid-field',
      };
    }
  }
  const bombsiteIndex = findBombsiteIndex(input.field, input.bombPosition);
  if (bombsiteIndex === undefined) {
    return { status: 'unavailable', reason: 'bomb-outside-expanded-bombsite' };
  }
  const nearest = findNearestPosition(
    input.field.positions,
    input.samplePosition,
  );
  if (nearest === undefined) {
    return { status: 'unavailable', reason: 'field-has-no-nearest-position' };
  }
  const record = getFieldRecord(
    input.field,
    bombsiteIndex,
    nearest.positionIndex,
  );
  const bombsite = input.field.bombsites[bombsiteIndex];
  if (!record || !bombsite) {
    return { status: 'unavailable', reason: 'field-record-missing' };
  }
  const rawDamage = calculateRawFieldDamage(bombsite.bombPower, record);
  return {
    status: 'resolved',
    bombsiteIndex,
    positionIndex: nearest.positionIndex,
    distanceSquared: nearest.distanceSquared,
    rawDamage,
    integerDamage: integerizeDamage(rawDamage),
    blastDirection: decodeBlastDirection(record.yaw, record.pitch),
    record,
    lookupPolicy: 'linear-squared-euclidean-lower-index-tie',
    overlapPolicy: 'first-expanded-aabb-match',
  };
}

/** Resolve the baked field only; this deliberately does not claim native entity-query parity. */
export function lookupBakedField(
  input: BakedFieldLookupInput,
): BakedFieldLookup {
  return lookupField(input);
}

/**
 * Apply the documented stance/facing arithmetic after an explicit sample point.
 * Ground/collision correction and native second-sample selection remain outside this function.
 */
export function evaluateBakedFieldCorrection(
  input: BakedFieldCorrectionInput,
): BakedFieldCorrection {
  const lookup = lookupField(input);
  if (lookup.status === 'unavailable') return lookup;
  let correction = correctionRangeForDucked(
    lookup.integerDamage,
    lookup.blastDirection,
    input.playerForward,
    input.ducked,
  );
  if (lookup.lookupPolicy === 'native-midpoint-float32-traversal-tie') {
    const normalized = normalizeDirection(input.playerForward);
    if (
      !normalized ||
      (input.ducked !== undefined && typeof input.ducked !== 'boolean')
    )
      return { status: 'unavailable', reason: 'invalid-correction-input' };
    const forward = floatVec(
      Math.abs(
        Math.hypot(
          input.playerForward.x,
          input.playerForward.y,
          input.playerForward.z,
        ) - 1,
      ) > 1e-4
        ? normalized
        : input.playerForward,
    );
    const values = (
      input.ducked === undefined ? [false, true] : [input.ducked]
    ).map((ducked) =>
      staticPlayerDamage(
        lookup.integerDamage,
        lookup.blastDirection,
        forward,
        ducked,
      ),
    );
    correction = {
      min: Math.min(...values),
      max: Math.max(...values),
      unknownInputs: input.ducked === undefined ? ['ducked'] : [],
    };
  }
  if (!correction)
    return { status: 'unavailable', reason: 'invalid-forward-vector' };
  return {
    ...lookup,
    damage: { min: correction.min, max: correction.max },
    unknownInputs: [
      ...correction.unknownInputs,
      'ground-collision-correction',
      'native-second-sample-selection',
    ],
    qualification: 'field-only-not-native-qualified',
  };
}

export function correctKnownDamage(
  damage: number,
  blastDirection: Vec3,
  playerForward: Vec3,
  ducked: boolean,
): number | undefined {
  return applyPlayerCorrections(damage, blastDirection, playerForward, ducked);
}
