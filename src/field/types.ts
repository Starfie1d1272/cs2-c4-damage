/** Source 2 world coordinates; no conversion to a pawn sample point is implied. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Library SemVer is intentionally absent: it does not identify gameplay data. */
export interface FieldMetadata {
  readonly formatVersion: 1;
  readonly modelRevision: string;
  readonly sourceBuildId: string | null;
  readonly resourceSha256: string | null;
  readonly mapName: string;
  readonly sourceResourceVersion: 1 | 2;
  readonly extraction: {
    readonly tool: string;
    readonly revision: string;
  };
}

export interface Bombsite {
  /** Index is not an A/B label. Bounds are unexpanded resource bounds. */
  readonly boundsMin: Vec3;
  readonly boundsMax: Vec3;
  readonly bombPower: number;
}

/** Raw decoded integers, not HP or degrees. Semantic conversion is not implemented. */
export interface FieldRecord {
  /** uint16 */
  readonly phase: number;
  /** uint8 */
  readonly yaw: number;
  /** uint8 */
  readonly pitch: number;
}

/** Proposed normalized contract, not a validated parser output. */
export interface BombDamageField {
  readonly metadata: FieldMetadata;
  readonly bombsites: readonly Bombsite[];
  readonly positions: readonly Vec3[];
  /** bombsite-major: bombsiteIndex * positions.length + positionIndex */
  readonly records: readonly FieldRecord[];
}
