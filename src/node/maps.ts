import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { bundledMapManifest } from '../maps/catalog.js';
import { unpackMapField } from '../maps/compact.js';
import type { BombDamageField } from '../field/types.js';
import { computeNormalizedFieldSha256 } from './index.js';
import { createStandingGsiPredictor, type GsiSnapshot } from '../gsi/index.js';
import type { StandingC4Outcome } from '../engine/standing.js';

/** Accept canonical names and short names; never resolve arbitrary filesystem paths. */
export function findBundledMap(mapName: string) {
  const name = mapName.toLowerCase().trim();
  return bundledMapManifest.maps.find(
    (m) => m.mapName === name || m.mapName === `de_${name}`,
  );
}

/** Read installed package assets; no network or local CS2 installation is needed. */
export async function loadBundledMap(
  mapName: string,
): Promise<BombDamageField> {
  const entry = findBundledMap(mapName);
  if (!entry) throw new Error('unsupported-map');
  // The CJS and ESM entries both live in dist/node; source tests live in src/node.
  const directory =
    typeof __dirname === 'string'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));
  const bytes = await readFile(
    resolve(directory, '../../maps', entry.fileName),
  );
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.byteLength !== entry.bytes || digest !== entry.sha256)
    throw new Error('bundled-map-integrity-mismatch');
  const field = unpackMapField(
    JSON.parse(
      gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8'),
    ),
  );
  const m = field.metadata;
  if (
    m.mapName !== entry.mapName ||
    m.modelRevision !== bundledMapManifest.modelRevision ||
    m.sourceBuildId !== bundledMapManifest.sourceBuildId ||
    m.sourceClientSha256 !== bundledMapManifest.sourceClientSha256 ||
    m.resourceSha256 !== entry.resourceSha256 ||
    m.normalizedFieldSha256 !== entry.normalizedFieldSha256 ||
    computeNormalizedFieldSha256(field) !== entry.normalizedFieldSha256 ||
    field.positions.length !== entry.positionCount ||
    field.bombsites.length !== entry.bombsiteCount
  )
    throw new Error('bundled-map-metadata-mismatch');
  return field;
}

export interface BundledGsiPredictor {
  predict(snapshot: GsiSnapshot): Promise<StandingC4Outcome>;
  /** Invalidate in-flight predictions on round end, disconnect or source reset. */
  reset(): void;
}

/** Auto-select the map and reuse a prepared standing predictor for normal frames. */
export function createBundledGsiPredictor(
  options: {
    /** Supply an alternate field loader when the host manages resources separately. */
    readonly loadMap?: (mapName: string) => Promise<BombDamageField>;
    readonly maxCachedMaps?: number;
  } = {},
): BundledGsiPredictor {
  const capacity = options.maxCachedMaps ?? 2;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10)
    throw new Error('invalid-map-cache-size');
  const load = options.loadMap ?? loadBundledMap;
  type Predictor = ReturnType<typeof createStandingGsiPredictor>;
  const cache = new Map<string, Promise<Predictor>>();
  let activeMap: string | undefined,
    generation = 0;
  const reset = () => {
    activeMap = undefined;
    generation++;
  };
  return {
    reset,
    async predict(input) {
      const snapshot = structuredClone(input);
      const entry =
        typeof snapshot.mapName === 'string'
          ? findBundledMap(snapshot.mapName)
          : undefined;
      if (!entry) {
        reset();
        return {
          status: 'unavailable',
          reason: snapshot.mapName ? 'unsupported-map' : 'missing-map',
        };
      }
      const mapName = entry.mapName;
      if (activeMap !== mapName) {
        activeMap = mapName;
        generation++;
      }
      const current = generation;
      let pending = cache.get(mapName);
      if (!pending) {
        pending = Promise.resolve()
          .then(() => load(mapName))
          .then((field) => {
            if (field.metadata.mapName !== mapName)
              throw new Error('loaded-map-name-mismatch');
            return createStandingGsiPredictor(field);
          });
        cache.set(mapName, pending);
        if (cache.size > capacity) cache.delete(cache.keys().next().value!);
      } else {
        cache.delete(mapName);
        cache.set(mapName, pending);
      }
      try {
        const predict = await pending;
        if (current !== generation)
          return { status: 'unavailable', reason: 'prediction-reset' };
        return predict({ ...snapshot, mapName });
      } catch {
        if (cache.get(mapName) === pending) cache.delete(mapName);
        return { status: 'unavailable', reason: 'map-resource-unavailable' };
      }
    },
  };
}
