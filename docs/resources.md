# Bundled map resources

Version 0.1.0 includes compact numerical damage tables for Ancient, Anubis, Cache, Dust II,
Inferno, Mirage, Nuke, Overpass, Train and Vertigo. They total 9,824,511 compressed bytes
(about 9.4 MiB). Runtime users install the npm package and select a map; no extraction,
Steam login, local CS2 installation or external resource download is required.

## Loading

```ts
import { loadBundledMap, createBundledGsiPredictor } from 'cs2-c4-damage/node';
import { bundledMapManifest } from 'cs2-c4-damage/maps';

const field = await loadBundledMap('de_cache');
const c4 = createBundledGsiPredictor();
// c4.predict(decodedSnapshot) automatically selects decodedSnapshot.mapName.
```

`loadBundledMap` accepts canonical names or short aliases. It reads assets relative to
the installed package, validates SHA-256 and source identities, and returns a normalized
field. For applications that copy/bundle Node output into a portable distribution,
include the package's `maps/` directory alongside `dist/`, preserving that layout.
The normal npm install layout works in both ESM and CJS.

`createBundledGsiPredictor` owns a bounded cache (default two maps; `maxCachedMaps: 1..10`),
reuses compiled predictors, and returns one standing estimate. Map changes and `reset()`
invalidate in-flight results. Call `reset()` on round end, disconnect or source changes;
no previous prediction is retained as a fallback. A supplied `loadMap` callback can
replace the bundled loader when the host manages its own resources.

The pure core accepts fields independently of Node. A Companion can call `loadBundledMap`
and pass the field to Core, which owns `createStandingGsiPredictor` and the resulting
per-player numbers. Do not send the complete field with every HUD frame.

## Manifest and encoding

`maps/manifest.json` and the `/maps` export describe the same generated catalog:

- Data revision `cs2-25687242-v1`, model `cs2-win64-2026-10-02-static-v2`.
- Source build `25687242`, app `730`, depot `2347770`, manifest `2625928478418236338`.
- Client SHA-256 `d7db25d48f1d10c5e0b0296e20ed803426eb9509da41760daeda39dd35ba89b9`.
- Per-map compressed file hash/size, source and normalized hashes, node/site counts.

Each gzip file contains the `c4-map-v1` representation: metadata and flat numerical
arrays for sites (min xyz, max xyz, power), positions (xyz) and records (phase, yaw,
pitch). `packMapField` and `unpackMapField` preserve record order and coordinate values.
The format contains no textures, meshes, sounds, DLLs, VPKs or vdata binaries.

Package SemVer, data revision and model revision remain separate. The library distributes
matched resources; users do not manually pair versions. Resource/model updates ship in
subsequent package versions as CS2 changes. Unsupported maps return `unavailable`.

## Maintainer regeneration

Source archives stay in ignored `qualification/`. Obtain the ten matching map VPKs and
a local Source2Viewer-CLI; pin its executable hash. Then run:

```sh
pnpm build
pnpm build:maps --vpk-dir qualification/current-common/game/csgo/maps \
  --decompiler /path/to/Source2Viewer-CLI \
  --decompiler-sha256 <sha256> --work-dir qualification/bundled-fields
pnpm exec prettier --write src/maps/catalog.ts maps/manifest.json
pnpm build
pnpm test:package
```

The generator extracts only each map's baked damage field, runs the pinned decompiler,
records source pairs, validates compact round trips against canonical hashes, compiles
each tree and queries each site's field. It writes `maps/*.json.gz`, the manifest and
its TypeScript catalog. All ten source fields have unique node coordinates.
The installed-package check loads every map and runs invented standing snapshots; unit
tests use synthetic fields. These are resource/integration checks, not live telemetry.

Custom extraction remains available through `extractFieldFromCompiled`, `extractField`
and the CLI `extract` command. A source format version is independent of package SemVer.
Existing normalized JSON keeps its recorded model revision.

## Attribution

Authored code is Apache-2.0. Numerical map tables derive from CS2 game resources; source
material rights remain with Valve and the respective owners. Full source archives and
original game resources are not redistributed. See [NOTICE](../NOTICE) and
[provenance](research/PROVENANCE.md) for the resource identities and tool attribution.
