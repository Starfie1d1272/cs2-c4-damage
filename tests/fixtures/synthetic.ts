import type { BombDamageField, PredictC4Input } from '../../src/index.js';

/** Invented data; no Valve resource content. */
export const field: BombDamageField = {
  metadata: {
    formatVersion: 1,
    modelRevision: 'synthetic-unqualified-v0',
    sourceBuildId: null,
    resourceSha256: null,
    decompiledVdataSha256: null,
    normalizedFieldSha256: null,
    sourcePairStatus: 'unverified-source-pair',
    mapName: 'synthetic_room',
    sourceResourceVersion: 2,
    extraction: { tool: 'hand-authored', revision: '1' },
  },
  bombsites: [
    {
      boundsMin: { x: -10, y: -10, z: -10 },
      boundsMax: { x: 10, y: 10, z: 10 },
      bombPower: 1,
    },
  ],
  positions: [{ x: 50, y: 0, z: 0 }],
  records: [{ phase: 42, yaw: 0, pitch: 0 }],
};
export const input: PredictC4Input = {
  field,
  bombPosition: { x: 0, y: 0, z: 0 },
  playerPosition: { x: 50, y: 0, z: 0 },
  playerForward: { x: 1, y: 0, z: 0 },
  ducked: undefined,
  health: 50,
};
