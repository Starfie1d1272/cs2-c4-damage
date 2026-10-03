import { describe, expect, it, vi } from 'vitest';
import { packMapField, unpackMapField } from '../src/maps/compact.js';
import {
  createStandingC4Predictor,
  createC4Predictor,
  STATIC_MODEL_REVISION,
  type BombDamageField,
} from '../src/index.js';
import { createStandingGsiPredictor } from '../src/gsi/index.js';
import { createBundledGsiPredictor, findBundledMap } from '../src/node/maps.js';
import { field as base } from './fixtures/synthetic.js';
const field = (mapName = 'de_mirage'): BombDamageField => ({
  ...structuredClone(base),
  metadata: { ...base.metadata, mapName, modelRevision: STATIC_MODEL_REVISION },
});
const snapshot = (mapName = 'de_mirage') => ({
  mapName,
  bombPosition: { x: 0, y: 0, z: 0 },
  playerPosition: { x: 50, y: 0, z: 0 },
  playerForward: { x: 1, y: 0, z: 0 },
  health: 100,
});
describe('bundled map and standing APIs with invented fixtures', () => {
  it('roundtrips compact records without changing order or numeric precision', () => {
    const f = field();
    const c = packMapField(f);
    expect(unpackMapField(c)).toEqual(f);
    expect(() => unpackMapField({ ...c, positions: [1, 2] })).toThrow(
      'invalid-compact-map',
    );
    expect(() => unpackMapField({ ...c, records: [70000, 0, 0] })).toThrow();
    expect(() =>
      unpackMapField({ ...c, sites: [0, 0, 0, 1, 1, 1, Infinity] }),
    ).toThrow();
  });
  it('returns the existing standing scenario as a single damage value', () => {
    const f = field(),
      s = snapshot();
    const input = {
      bombPosition: s.bombPosition,
      playerPosition: s.playerPosition,
      playerForward: s.playerForward,
      health: s.health,
    };
    const original = createC4Predictor(f)({ ...input, ducked: false });
    const result = createStandingC4Predictor(f)(input);
    expect(original.status).toBe('conditional');
    if (original.status === 'conditional')
      expect(result).toMatchObject({
        status: 'predicted',
        stance: 'standing',
        damage: original.scenarios[0]!.damage,
        hpAfter: original.scenarios[0]!.hpAfter,
      });
    expect(createStandingGsiPredictor(f)(s)).toEqual(result);
    expect(
      createStandingGsiPredictor(f)({ ...s, health: undefined } as never)
        .status,
    ).toBe('unavailable');
  });
  it('supports Cache and short names, rejects paths, and reuses a bounded map cache', async () => {
    expect(findBundledMap('cache')?.mapName).toBe('de_cache');
    expect(findBundledMap('../../de_cache')).toBeUndefined();
    const load = vi.fn(async (name: string) => field(name));
    const service = createBundledGsiPredictor({
      loadMap: load,
      maxCachedMaps: 1,
    });
    expect((await service.predict(snapshot())).status).toBe('predicted');
    expect((await service.predict(snapshot())).status).toBe('predicted');
    expect(load).toHaveBeenCalledTimes(1);
    await service.predict(snapshot('de_cache'));
    await service.predict(snapshot());
    expect(load).toHaveBeenCalledTimes(3);
    expect(await service.predict({})).toEqual({
      status: 'unavailable',
      reason: 'missing-map',
    });
    expect(await service.predict(snapshot('de_unknown'))).toEqual({
      status: 'unavailable',
      reason: 'unsupported-map',
    });
  });
  it('invalidates in-flight work on resets/map changes and retries failed loads', async () => {
    let complete!: (f: BombDamageField) => void;
    const delayed = new Promise<BombDamageField>((r) => {
      complete = r;
    });
    const service = createBundledGsiPredictor({
      loadMap: async (name) => (name === 'de_mirage' ? delayed : field(name)),
    });
    const previous = service.predict(snapshot());
    expect((await service.predict(snapshot('de_cache'))).status).toBe(
      'predicted',
    );
    complete(field());
    expect(await previous).toEqual({
      status: 'unavailable',
      reason: 'prediction-reset',
    });
    const pending = service.predict(snapshot());
    service.reset();
    expect(await pending).toEqual({
      status: 'unavailable',
      reason: 'prediction-reset',
    });
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValue(field());
    const retry = createBundledGsiPredictor({ loadMap: load });
    expect((await retry.predict(snapshot())).status).toBe('unavailable');
    expect((await retry.predict(snapshot())).status).toBe('predicted');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
