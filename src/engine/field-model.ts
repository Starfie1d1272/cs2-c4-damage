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
      readonly lookupPolicy: 'linear-squared-euclidean-lower-index-tie';
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
  const correction = correctionRangeForDucked(
    lookup.integerDamage,
    lookup.blastDirection,
    input.playerForward,
    input.ducked,
  );
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
