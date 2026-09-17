# cs2-c4-damage

[中文完整说明](README.zh-CN.md)

An independent, reusable TypeScript library for parsing current-CS2 baked C4 damage
fields, exposing auditable field-only calculations, and preparing matched builds for
native qualification. **The external model is implemented and qualification-ready,
but it is not dynamically native-parity-qualified.**

> This project does not inject into CS2.
>
> This project does not hook client.dll/server.dll.
>
> This project does not ship Valve game assets.

**GSI-only estimation cannot currently claim complete native parity,
because GSI does not expose every input used by the native query.**

## Status and scope

Implemented:

- strict parsing and validation of Source 2 Viewer decompiled
  `CS2_BOMB_DAMAGE_DATA` resources (versions 1 and 2);
- 32-unit bombsite expansion, deterministic field lookup, raw Phase/power
  conversion, `/256` direction decoding, and documented Bias/truncation math;
- an explicit-sample field-only helper that keeps native collision and second-sample
  uncertainty visible;
- a decoded GSI-like adapter, Node extraction/inspection/prediction CLI, and a
  machine-readable qualification harness with build/resource identity checks.

`predictC4Outcome` deliberately returns `unavailable: model-not-qualified` for
valid inputs. Static analysis proved that the native query needs a target-supplied
sample point, collision/ground truth and a conditional second sample that ordinary
field data plus GSI cannot reconstruct. See [native query closure](docs/research/native-query-closure.md).

The `exact` outcome is reserved for a qualified complete model. `bounded` is
available only from `outcomeFromDamageRange` when the caller supplies a proven
inclusive envelope; a field-only estimate is not silently promoted to that envelope.
Unknown is never zero, standing, or a successful native query.

This is a library, not a HUD. It has zero runtime dependencies and no dependency on
RivalHub, React, OBS, Fastify, CSTV or a particular GSI library.
RivalHub-Broadcast may become one downstream consumer.

## Architecture

```text
user-owned CS2 map resource + compiled resource
  → Node extraction / normalized field + provenance
  → pure field parser, lookup and arithmetic
  → decoded telemetry adapter / qualification harness
  → exact only after matched-build native qualification
```

The field contract retains bombsite bounds/power, positions, raw Phase/Yaw/Pitch
and extraction provenance. Field format version, model revision, CS2 build/resource
identity and library SemVer have separate meanings. See [architecture](docs/architecture.md),
[model status](docs/model.md), and [provenance](docs/research/PROVENANCE.md).

## API

```ts
import { outcomeFromDamageRange, predictC4Outcome } from 'cs2-c4-damage';
import { assessGsiSnapshot } from 'cs2-c4-damage/gsi';
import { parseBombDamageVdata } from 'cs2-c4-damage';

// Synthetic arithmetic example ONLY; these bounds are not inferred from GSI.
outcomeFromDamageRange(50, { min: 40, max: 60 }, ['ducked']);
// bounded; hpAfter: { min: 0, max: 10 }; lethal: 'indeterminate'

assessGsiSnapshot({ health: 50 });
// Missing spatial values, unknown ducked, collision and native second sample.

// With a valid field and ordinary external inputs this remains fail-closed until
// a matched native qualification has established the missing semantics.
predictC4Outcome({
  field,
  bombPosition,
  playerPosition,
  playerForward,
  ducked,
  health,
});

// Parser provenance is explicit; unknown hashes are represented as null.
parseBombDamageVdata(vdataText, {
  mapName: 'de_mirage',
  sourceBuildId: '25218825',
  resourceSha256: compiledResourceSha256,
  decompiledVdataSha256,
  extraction: { tool: 'Source 2 Viewer', revision: '20.0.6980' },
});
```

The parser records `sourcePairStatus: "unverified-source-pair"`: hashing a supplied
compiled resource and a supplied decompiled text does not prove that one was produced
from the other. The Node extractor also records the decompiled hash and a canonical
`normalizedFieldSha256`; qualification binds those identities but keeps the source-pair
limitation explicit.

`C4Outcome` distinguishes `exact`, `bounded` and `unavailable`. For a proven
inclusive damage envelope, lethal is true when its minimum reaches HP, false when
its maximum is below HP, and indeterminate otherwise. Equal endpoints remain
`bounded`; this helper does not qualify the source of the range.

The GSI entry accepts an **already decoded GSI-like snapshot**, not raw Valve JSON.
It validates bomb/player positions, forward and positive health, never manufactures
crouch state, and does not assess freshness, observer coverage or RivalHub runtime
continuity.

## Node tooling

The package exposes `cs2-c4-damage/node` and a same-package `cs2-c4-damage` binary.
The extractor reads user-owned files; it does not vendor or publish Valve resources.

```sh
cs2-c4-damage extract \
  --vdata <decompiled.vdata> \
  --compiled <baked_bomb_damage.vdata_c> \
  --map de_mirage \
  --build-id 25218825 \
  --client-sha256 <client.dll-sha256> \
  --out field.json

cs2-c4-damage inspect field.json
cs2-c4-damage predict field.json --bomb-position x,y,z \
  --player-position x,y,z --forward x,y,z --health 100 \
  --ducked unknown
cs2-c4-damage qualify vectors.json field.json
```

`predict` reports the fail-closed top-level outcome. An optional explicit
`--sample-position` prints a clearly labelled field-only calculation; it is not a
native-parity prediction or a conservative native damage envelope.

Qualification vectors require `schemaVersion: 1`, an explicit `modelRevision`, compiled
and decompiled resource hashes, `normalizedFieldSha256`, and
`sourcePairStatus: "unverified-source-pair"`; they may preserve `nativeFailureReason`
and an evidence-only native trace. The current harness compares final native validity
and damage only. A pass requires at least one native-valid case, exact damage for every
positive case, and no unresolved positive case; negative cases are reported separately.
It does not by itself close Q1–Q3; those require Windows trace instrumentation or
equivalent native debug capture.

## Development

Node >=22 and pnpm (version pinned in `package.json`):

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
```

Single package, strict TypeScript, tsup, and ESM + CommonJS exports at the root,
`/gsi` and `/node`. CI runs Node 22 and 24 on Linux, Windows and macOS. Deterministic
tests use invented fixtures; real-asset qualification belongs in gitignored
`qualification/` or `.agent-tmp/` and is not part of the package. See [contributing](CONTRIBUTING.md).

The package remains private at version `0.0.0` as an accidental-publication guard.
There is no npm release or GitHub release.

## Research credits

The current-CS2 native C4 damage query path, client HUD call chain, server
actual-damage path, ABI, stance/facing correction and armor semantics are key native
findings from [unicbm](https://github.com/unicbm)'s reverse-engineering research.
This project was established with the author's permission to use that research.
The external implementation, API, GSI uncertainty model and tests are this project's
subsequent work; the original research is not a claim of external-engine parity.

[Source 2 Viewer](https://s2v.app) /
[ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat)
provides public resource-format prior art and the planned extraction route. No
upstream implementation code or Valve assets are copied into this package.
Valve's [July 2026 update record](https://store.steampowered.com/news/posts/?appids=730&enddate=1784076119)
documents precomputed bomb damage and the expanding shockwave.
See [provenance and pinned references](docs/research/PROVENANCE.md).

## License and attribution

New project code is [Apache-2.0](LICENSE), supporting reuse in open-source,
closed-source and commercial tooling with the license's attribution and patent terms.
AGPL applications such as RivalHub-Broadcast may consume it as a dependency;
their own obligations remain applicable.

**Exception:** the original research Markdown is copyright unicbm, reproduced and
used for implementation with permission. It is **not relicensed under Apache-2.0**.
The permission record does not invent a separate public sublicense for that text.
Read [authorization](docs/research/authorization.md), [NOTICE](NOTICE) and [CREDITS](CREDITS.md).
Research text is excluded from the package's publish allowlist.

This project is not endorsed by Valve, Counter-Strike or Steam.
