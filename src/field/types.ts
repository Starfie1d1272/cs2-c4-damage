/** Source 2 world coordinates; no conversion to a pawn sample point is implied. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The current extractor does not prove that a decompiled text file came from the compiled resource. */
export type SourcePairStatus = 'unverified-source-pair';

/** Library SemVer is intentionally absent: it does not identify gameplay data. */
export interface FieldMetadata {
  readonly formatVersion: 1;
  readonly modelRevision: string;
  readonly sourceBuildId: string | null;
  /** Optional native binary identity; absence keeps qualification fail-closed. */
  readonly sourceClientSha256?: string | null;
  readonly resourceSha256: string | null;
  /** SHA-256 of the exact decompiled text when the extractor received it. */
  readonly decompiledVdataSha256: string | null;
  /** SHA-256 of the canonical normalized field payload, excluding metadata identities. */
  readonly normalizedFieldSha256: string | null;
  readonly sourcePairStatus: SourcePairStatus;
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

/** Raw decoded integers, not HP or degrees; semantic conversion is a separate engine step. */
export interface FieldRecord {
  /** uint16 */
  readonly phase: number;
  /** uint8 */
  readonly yaw: number;
  /** uint8 */
  readonly pitch: number;
}

/** Normalized field contract; callers must validate untrusted values before use. */
export interface BombDamageField {
  readonly metadata: FieldMetadata;
  readonly bombsites: readonly Bombsite[];
  readonly positions: readonly Vec3[];
  /** bombsite-major: bombsiteIndex * positions.length + positionIndex */
  readonly records: readonly FieldRecord[];
}
