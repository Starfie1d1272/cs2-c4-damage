import { describe, expect, it } from 'vitest';
import { outcomeFromDamageRange, predictC4Outcome } from '../src/index.js';
import { assessGsiSnapshot } from '../src/gsi/index.js';
import { input } from './fixtures/synthetic.js';

describe('synthetic uncertainty contract', () => {
  it('preserves ranges while distinguishing certain and indeterminate lethality', () => {
    for (const [min, max, lethal, hpMin, hpMax] of [
      [10, 20, false, 30, 40],
      [50, 70, true, 0, 0],
      [40, 60, 'indeterminate', 0, 10],
      [0, 0, false, 50, 50],
    ] as const) {
      expect(outcomeFromDamageRange(50, { min, max }, ['ducked'])).toEqual({
        status: 'bounded',
        damage: { min, max },
        hpAfter: { min: hpMin, max: hpMax },
        lethal,
        unknownInputs: ['ducked'],
      });
    }
  });
  it('fails closed for invalid bounds/health and unqualified fields', () => {
    for (const range of [
      { min: -1, max: 20 },
      { min: 60, max: 40 },
      { min: 0, max: 256 },
      { min: NaN, max: 20 },
      { min: 1.5, max: 20 },
      { min: 0, max: Infinity },
    ]) {
      expect(outcomeFromDamageRange(50, range, []).status).toBe('unavailable');
    }
    for (const health of [0, -1, NaN, Infinity, 0.5]) {
      expect(
        outcomeFromDamageRange(health, { min: 0, max: 20 }, []).status,
      ).toBe('unavailable');
    }
    expect(predictC4Outcome(input)).toEqual({
      status: 'unavailable',
      reason: 'model-not-qualified',
    });
    expect(predictC4Outcome({ ...input, ducked: false }).status).toBe(
      'unavailable',
    );
  });
  it('never invents standing or a native sample point from complete GSI-like telemetry', () => {
    const assessment = assessGsiSnapshot(input);
    expect(assessment.ducked).toBeUndefined();
    expect(assessment.unknownInputs).toEqual([
      'ducked',
      'native-sample-point',
      'ground-collision-correction',
    ]);
    expect(assessGsiSnapshot({}).unknownInputs).toContain('health');
  });
});
