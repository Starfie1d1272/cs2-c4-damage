import { describe, expect, it } from 'vitest';
import {
  applyPlayerCorrections,
  BombDamageParseError,
  calculateRawFieldDamage,
  correctionRangeForDucked,
  decodeBlastDirection,
  evaluateBakedFieldCorrection,
  expandBombsiteBounds,
  findBombsiteIndex,
  findNearestPosition,
  getFieldRecord,
  lookupBakedField,
  parseBombDamageVdata,
  scaleDamage,
  validateBombDamageField,
} from '../src/index.js';
import { field } from './fixtures/synthetic.js';

const SITE =
  '00 00 80 BF 00 00 80 BF 00 00 80 BF 00 00 80 3F 00 00 80 3F 00 00 80 3F 00 00 00 40';
const POSITIONS = '00 00 00 00 00 00 0A 00 00 00 00 00';
const RECORDS = '01 00 00 00 08 00 40 00';

function vdata(version: number): string {
  return `generic_data_type = "CS2_BOMB_DAMAGE_DATA"
header = { version = ${version} }
data = {
  bombsites = #[ ${SITE} ]
  positions = #[ ${POSITIONS} ]
  damage_values = #[ ${RECORDS} ]
}`;
}

describe('baked-field parser and spatial engine', () => {
  it.each([1, 2] as const)(
    'parses resource version %s with site-major records',
    (version) => {
      const parsed = parseBombDamageVdata(vdata(version), {
        mapName: 'de_mirage',
        sourceBuildId: '25218825',
        resourceSha256: 'a'.repeat(64),
        extraction: { tool: 'synthetic-source2viewer', revision: 'test' },
      });
      expect(parsed.metadata.sourceResourceVersion).toBe(version);
      expect(parsed.bombsites).toHaveLength(1);
      expect(parsed.positions).toEqual([
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
      ]);
      expect(parsed.records).toEqual([
        { phase: 1, yaw: 0, pitch: 0 },
        { phase: 8, yaw: 64, pitch: 0 },
      ]);
      expect(validateBombDamageField(parsed)).toEqual([]);
    },
  );

  it('rejects wrong type, malformed byte lengths and record cardinality', () => {
    expect(() =>
      parseBombDamageVdata(vdata(1).replace('CS2_BOMB_DAMAGE_DATA', 'OTHER'), {
        mapName: 'map',
        sourceBuildId: null,
        resourceSha256: null,
        extraction: { tool: 'test', revision: '1' },
      }),
    ).toThrow(BombDamageParseError);
    expect(() =>
      parseBombDamageVdata(vdata(1).replace(POSITIONS, '00'), {
        mapName: 'map',
        sourceBuildId: null,
        resourceSha256: null,
        extraction: { tool: 'test', revision: '1' },
      }),
    ).toThrow(BombDamageParseError);
    expect(() =>
      parseBombDamageVdata(vdata(1).replace(RECORDS, '01 00 00 00'), {
        mapName: 'map',
        sourceBuildId: null,
        resourceSha256: null,
        extraction: { tool: 'test', revision: '1' },
      }),
    ).toThrow(BombDamageParseError);
  });

  it('expands bombsite bounds and handles overlap/outside deterministically', () => {
    const bounds = expandBombsiteBounds(field.bombsites[0]!);
    expect(bounds.min).toEqual({ x: -42, y: -42, z: -42 });
    expect(bounds.max).toEqual({ x: 42, y: 42, z: 42 });
    expect(findBombsiteIndex(field, { x: -42, y: 0, z: 0 })).toBe(0);
    expect(findBombsiteIndex(field, { x: 43, y: 0, z: 0 })).toBeUndefined();
    expect(
      findNearestPosition(
        [
          { x: 0, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
        { x: 1, y: 0, z: 0 },
      ),
    ).toEqual({
      positionIndex: 0,
      distanceSquared: 1,
    });
    expect(
      getFieldRecord(
        { positions: field.positions, records: field.records },
        0,
        0,
      ),
    ).toEqual(field.records[0]);
  });

  it('implements raw Phase conversion and /256 direction decoding', () => {
    expect(calculateRawFieldDamage(1, { phase: 0 })).toBe(100);
    expect(calculateRawFieldDamage(0, { phase: 0 })).toBe(0);
    expect(calculateRawFieldDamage(2, { phase: 1 })).toBe(200);
    expect(calculateRawFieldDamage(100, { phase: 1800 })).toBeCloseTo(100 / 18);
    expect(calculateRawFieldDamage(2000, { phase: 2000 })).toBe(100);
    expect(calculateRawFieldDamage(1, { phase: 2000 })).toBe(0);
    expect(decodeBlastDirection(0, 0)).toEqual({ x: 1, y: 0, z: -0 });
    expect(decodeBlastDirection(64, 0).x).toBeCloseTo(0);
    expect(decodeBlastDirection(64, 0).y).toBeCloseTo(1);
    expect(decodeBlastDirection(0, 64).z).toBeCloseTo(-1);
  });

  it('keeps Bias boundaries and integer truncation explicit', () => {
    expect(scaleDamage(50, 0.45)).toBe(44);
    expect(scaleDamage(50, 0.53)).toBe(53);
    const direction = { x: 1, y: 0, z: 0 };
    const positive = applyPlayerCorrections(50, direction, direction, false);
    const negative = applyPlayerCorrections(
      50,
      direction,
      { x: -1, y: 0, z: 0 },
      false,
    );
    const orthogonal = applyPlayerCorrections(
      50,
      direction,
      { x: 0, y: 1, z: 0 },
      false,
    );
    expect(positive).toBe(scaleDamage(50, 0.47));
    expect(negative).toBe(scaleDamage(50, 0.53));
    expect(orthogonal).toBe(scaleDamage(50, 0.5));
    expect(applyPlayerCorrections(100, direction, direction, true)).toBe(100);
    expect(applyPlayerCorrections(99, direction, direction, true)).toBe(
      scaleDamage(scaleDamage(99, 0.45), 0.47),
    );
    const standing = scaleDamage(50, 0.47);
    const crouched = scaleDamage(scaleDamage(50, 0.45), 0.47);
    expect(
      correctionRangeForDucked(50, direction, direction, undefined),
    ).toEqual({
      min: crouched,
      max: standing,
      unknownInputs: ['ducked'],
    });
  });

  it('exposes field-only lookup while retaining native correction uncertainty', () => {
    const lookup = lookupBakedField({
      field,
      bombPosition: { x: 0, y: 0, z: 0 },
      samplePosition: { x: 50, y: 0, z: 0 },
    });
    expect(lookup.status).toBe('resolved');
    if (lookup.status === 'resolved') expect(lookup.integerDamage).toBe(2);
    const correction = evaluateBakedFieldCorrection({
      field,
      bombPosition: { x: 0, y: 0, z: 0 },
      samplePosition: { x: 50, y: 0, z: 0 },
      playerForward: { x: 1, y: 0, z: 0 },
      ducked: undefined,
    });
    expect(correction.status).toBe('resolved');
    if (correction.status === 'resolved') {
      expect(correction.qualification).toBe('field-only-not-native-qualified');
      expect(correction.unknownInputs).toContain('ground-collision-correction');
    }
    expect(
      lookupBakedField({
        field,
        bombPosition: { x: 100, y: 0, z: 0 },
        samplePosition: { x: 50, y: 0, z: 0 },
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'bomb-outside-expanded-bombsite',
    });
  });
});
