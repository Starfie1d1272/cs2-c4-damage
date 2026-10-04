# cs2-c4-damage

Drop-in CS2 C4 damage prediction for custom HUDs — no CS2 installation, extraction or runtime network access required.

[![npm version](https://img.shields.io/npm/v/cs2-c4-damage?logo=npm)](https://www.npmjs.com/package/cs2-c4-damage)
[![CI](https://github.com/Starfie1d1272/cs2-c4-damage/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Starfie1d1272/cs2-c4-damage/actions/workflows/ci.yml)
[![Code license: Apache-2.0](https://img.shields.io/badge/code_license-Apache--2.0-blue)](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/LICENSE)

[简体中文](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/README.zh-CN.md) · [Documentation](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/README.md) · [Changelog](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CHANGELOG.md)

Estimate damage, post-explosion HP and lethality for HUDs and broadcast overlays, assuming a standing player.

- **10 bundled maps** with automatic selection, on-demand loading and predictor reuse.
- **GSI-ready** adapters for bomb and player state from Game State Integration snapshots.
- **Zero runtime npm dependencies**, ESM/CJS exports and TypeScript declarations.
- **Fits your HUD**: your application owns the GSI receiver and display.

## Install

```sh
npm install cs2-c4-damage
```

Node.js 22+ is required for automatic resource loading. The core and GSI adapter are pure
TypeScript/JavaScript, with ESM/CJS exports, types and zero runtime npm dependencies.

## Quick start

```ts
import { createBundledGsiPredictor } from 'cs2-c4-damage/node';
import { decodeGsiSnapshot } from 'cs2-c4-damage/gsi';

const c4 = createBundledGsiPredictor();

export async function handleGsi(payload: unknown, steamId?: string) {
  const result = await c4.predict(decodeGsiSnapshot(payload, steamId));
  if (result.status === 'predicted') {
    console.log(result.damage); // one standing-damage value for the HUD
    console.log(result.hpAfter, result.lethal);
  }
  return result; // hide the prediction when status is 'unavailable'
}

// On round end, disconnect or source restart:
export function resetC4() {
  c4.reset();
}
```

`steamId` selects `allplayers[steamId]`; omit it to use `player`. Supply GSI map name,
planted/defusing bomb position, player position, forward and health. Your application
owns the GSI receiver and HUD display. A short tooltip such as “Standing estimate” is
sufficient to identify the displayed value.

The service selects the map, loads its bundled field and reuses the compiled predictor
on subsequent updates. It caches up to two maps by default, drops stale in-flight results
on map changes/reset, and returns `unavailable` for missing inputs or unsupported maps.
No local CS2 installation, extraction tool, manual resource download or network request
is needed at runtime.

## Accuracy

The HUD value is a standing estimate. Missing collision/posture state and game updates can
cause differences from actual damage; the model does not promise exact live-game simulation.

## Included maps

Ancient, Anubis, **Cache**, Dust II, Inferno, Mirage, Nuke, Overpass, Train and Vertigo.
Canonical names such as `de_cache` and short names such as `cache` are accepted by the
bundled loader. Compressed numerical tables total about 9.4 MiB and ship with the package.
Each map is loaded on demand; importing the core does not load map files.

The package pairs its map data with its model revision internally. Updates to bundled
resources are delivered through library releases. The
[resource guide](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/resources.md)
documents the manifest and maintainer regeneration process.

## Separate resource loading and calculation

For applications with a Companion/Core split, load the field on the Node side and create
the predictor in the calculation owner:

```ts
import { loadBundledMap } from 'cs2-c4-damage/node';
import { createStandingGsiPredictor } from 'cs2-c4-damage/gsi';

const field = await loadBundledMap('de_cache');
const predict = createStandingGsiPredictor(field);
// Reuse for each player's decoded snapshot; recreate when changing maps.
const result = predict(snapshot);
```

`createStandingC4Predictor(field)` from the root entry accepts direct bomb/player
positions, forward and health. These standing APIs return:

| Status        | Fields                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `predicted`   | Numeric `damage`, `hpAfter`, boolean `lethal`, `stance: 'standing'`, model identity and assumptions. |
| `unavailable` | `reason`; the HUD can hide the value.                                                                |

The existing `createC4Predictor` and `createGsiC4Predictor` APIs remain available for
multi-scenario calculations. Advanced callers can provide native sampling/collision
state or inspect stage traces; see the
[model/API guide](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/model.md).

## Data and tooling

`cs2-c4-damage/maps` exports `bundledMapManifest`, `packMapField` and `unpackMapField` for
resource-aware applications. `loadBundledMap` checks the compressed file hash, metadata
and normalized field identity before returning it.

The CLI retains `extract`, `inspect`, `predict`, `compare-traces` and `qualify` for custom
resources and research. Extraction is a maintainer/advanced workflow; ordinary HUD
integration uses the included maps.

## Development

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
```

[Documentation](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/README.md) ·
[Changelog](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CHANGELOG.md) ·
[Contributing](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CONTRIBUTING.md) ·
[Releasing](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/releasing.md)

Authored code is Apache-2.0. Original research is credited to [unicbm](https://github.com/unicbm).
Bundled numerical map tables are derived from CS2; rights in source game materials remain
with their owners. See [credits](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CREDITS.md)
and [NOTICE](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/NOTICE).
