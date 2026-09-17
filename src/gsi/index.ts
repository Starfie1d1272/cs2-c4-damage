import type { Vec3 } from '../field/types.js';

/** Already decoded GSI-like snapshot; not Valve wire JSON or a complete GSI schema. */
export interface GsiSnapshot {
  readonly bombPosition?: Vec3;
  readonly playerPosition?: Vec3;
  readonly playerForward?: Vec3;
  readonly health?: number;
}

/** Adapter boundary only. Wire parsing, freshness and prediction are deferred. */
export interface GsiAssessment {
  readonly snapshot: GsiSnapshot;
  readonly ducked: undefined;
  readonly unknownInputs: readonly string[];
}

/** Records native gaps even when every exposed telemetry field is present. */
export function assessGsiSnapshot(snapshot: GsiSnapshot): GsiAssessment {
  const missing = (
    ['bombPosition', 'playerPosition', 'playerForward', 'health'] as const
  ).filter((key) => snapshot[key] === undefined);
  return {
    snapshot,
    ducked: undefined,
    unknownInputs: [
      ...missing,
      'ducked',
      'native-sample-point',
      'ground-collision-correction',
    ],
  };
}
