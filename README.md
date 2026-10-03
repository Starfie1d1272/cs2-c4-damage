# cs2-c4-damage

[简体中文](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/README.zh-CN.md)

Calculate CS2 C4 damage, remaining HP and lethality from baked map damage fields and
Game State Integration (GSI) snapshots.

- Reusable predictors for GSI updates, with standing and crouched scenarios.
- Native-style float32 arithmetic, midpoint KD-tree lookup and two-stage sampling.
- Resource extraction, validation and SHA-256 provenance tracking.
- Per-stage traces for inspecting and comparing calculations.
- TypeScript declarations, ESM/CJS exports, a CLI and zero runtime npm dependencies.

## Install

Requires Node.js 22 or later for the CLI and Node helpers.

```sh
npm install cs2-c4-damage@beta
```

The root library and GSI adapter are pure TypeScript/JavaScript and can also be bundled
for browser applications. File access and decompiler execution live in `/node`.

## Prepare a map

Use [Source 2 Viewer](https://s2v.app) to extract
`maps/<map>/baked_bomb_damage.vdata_c` from your local CS2 map VPK. Keep the field paired
with the game build it came from. Game resources are supplied by your application.

The CLI can run your local Source2Viewer-CLI and normalize its output:

```sh
npx cs2-c4-damage extract \
  --compiled /your/resources/baked_bomb_damage.vdata_c \
  --decompiler /your/tools/Source2Viewer-CLI \
  --decompiler-sha256 <sha256-of-the-executable> \
  --map de_mirage --build-id 25687242 \
  --out /your/resources/mirage.json

npx cs2-c4-damage inspect /your/resources/mirage.json
```

Use `sha256sum`, `shasum -a 256`, or PowerShell `Get-FileHash -Algorithm SHA256` to
compute the executable hash. You can also pass `--client-sha256` to record the matching
client binary identity. If you already have decompiled text, use `--vdata <text-file>`
instead of the two `--decompiler` options.

See the [resource guide](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/resources.md)
for build identities, extraction options and updating maps.

## Predict from GSI

Load the field and create the predictor once, then reuse it for incoming snapshots:

```ts
import { readNormalizedField } from 'cs2-c4-damage/node';
import { createGsiC4Predictor, decodeGsiSnapshot } from 'cs2-c4-damage/gsi';

const field = await readNormalizedField('/your/resources/mirage.json');
const predict = createGsiC4Predictor(field);

export function handleGsi(payload: unknown, steamId?: string) {
  // steamId selects allplayers[steamId]; omit it to select player.
  const result = predict(decodeGsiSnapshot(payload, steamId));
  if (result.status === 'conditional') {
    console.log(result.damage); // { min, max } across the evaluated scenarios
    console.log(result.hpAfter, result.lethal);
    console.log(result.scenarios); // individual posture, damage and sampling trace
  }
  return result;
}
```

Enable the GSI data needed for bomb position, player position, forward and health.
Field availability depends on your GSI configuration and viewing mode. The adapter
accepts coordinate strings or numeric triples, handles planted/defusing bombs, and
checks the map name when supplied. Your application owns the GSI HTTP receiver.

| Result        | Meaning                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `conditional` | Damage and HP ranges across the listed scenarios, plus `lethal`, `assumptions` and `unknownInputs`.                             |
| `unavailable` | A required input is missing/invalid, the resource identity is unsupported, or the field query cannot resolve. Inspect `reason`. |

`lethal` is `true`, `false` or `'indeterminate'` across those scenarios. For a decoded
snapshot, call the prepared predictor directly. The one-shot alternative is
`predictC4OutcomeFromGsi(field, snapshot)`.

## Direct inputs and sampling

Use the root API when your application already has player and bomb state:

```ts
import { createC4Predictor } from 'cs2-c4-damage';

const predict = createC4Predictor(field);
const result = predict({
  bombPosition: { x: 100, y: 200, z: 0 },
  playerPosition: { x: 150, y: 250, z: 0 },
  playerForward: { x: 1, y: 0, z: 0 },
  health: 100,
  ducked: undefined, // evaluate both postures; pass true/false when known
});
```

Optional `nativeState` supplies the collision bounds/transform and a ground result or
collision-query provider. `runStaticSampling` exposes the first lookup, second lookup,
selected stage and corrected damage. See the
[model and API guide](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/model.md).

## CLI

```sh
npx cs2-c4-damage predict /your/resources/mirage.json \
  --bomb-position 100,200,0 --player-position 150,250,0 \
  --forward 1,0,0 --health 100 --ducked unknown

npx cs2-c4-damage compare-traces expected.json actual.json
npx cs2-c4-damage qualify vectors.json /your/resources/mirage.json
```

`predict` prints JSON. `compare-traces` compares sampling stages and reports differing
paths. `qualify` checks versioned reference vectors and their resource identities.

## Development and documentation

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
```

- [Documentation index](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/README.md)
- [Architecture](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/architecture.md)
- [Changelog](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CHANGELOG.md)
- [Contributing](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CONTRIBUTING.md) · [Releasing](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/docs/releasing.md)

New code is Apache-2.0. Original research is credited to
[unicbm](https://github.com/unicbm) and retains its own copyright;
see [credits](https://github.com/Starfie1d1272/cs2-c4-damage/blob/main/CREDITS.md).

## Accuracy

Results use model `cs2-win64-2026-10-02-static-v2` and matching map resources. GSI omits
some posture and collision state, so ground resampling, dynamic obstacles or unusual
transforms can prevent exact simulation. Reported ranges cover the listed scenarios,
not every missing state; full native parity has not yet been validated in live captures.
