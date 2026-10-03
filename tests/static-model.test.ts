import { describe, expect, it } from 'vitest';
import oracle from './fixtures/native-static-oracle.json' with { type: 'json' };
import { createNativeTree } from '../src/field/native-tree.js';
import {
  staticBlastDirection,
  staticRawDamage,
  staticScaleDamage,
} from '../src/engine/static-math.js';
const vec = (p: number[]) => ({ x: p[0]!, y: p[1]!, z: p[2]! });
describe('2026-10-02 synthetic native instruction oracles', () => {
  it('matches native BuildMidpoint + Nearest including duplicates, ties and leaf boundaries', () => {
    for (const set of oracle.trees) {
      const tree = createNativeTree(set.points.map(vec));
      expect(
        set.queries.map((p) => tree.nearest(vec(p))?.positionIndex),
      ).toEqual(set.expected);
    }
  });
  it('matches native remap/clamp and all sub-100 Bias values', () => {
    for (const [power, phase, result] of oracle.raw)
      expect(staticRawDamage(power!, phase!)).toBe(result);
    for (const [damage, parameter, result] of oracle.scales)
      expect(staticScaleDamage(damage!, parameter!)).toBe(result);
  });
  it('matches all 256 native byte angles component by component', () => {
    const f = Math.fround;
    for (let yaw = 0; yaw < 256; yaw++) {
      const pitch = (yaw * 13) % 256;
      const [sy, cy] = oracle.sinCos[yaw]!;
      const [sp, cp] = oracle.sinCos[pitch]!;
      expect(staticBlastDirection(yaw, pitch)).toEqual({
        x: f(cy! * cp!),
        y: f(sy! * cp!),
        z: -sp!,
      });
    }
  });
});
