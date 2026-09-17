# cs2-c4-damage

[中文完整说明](README.zh-CN.md)

An independent, reusable TypeScript library foundation for estimating C4 damage,
remaining HP and lethal outcomes from current-CS2 baked bomb-damage fields and
external telemetry. **Research foundation only; no qualified native predictor yet.**

> This project does not inject into CS2.
>
> This project does not hook client.dll/server.dll.
>
> This project does not ship Valve game assets.

**GSI-only estimation cannot currently claim complete native parity,
because GSI does not expose every input used by the native query.**

## Status and scope

Implemented: domain contracts, an explicitly fail-closed prediction entry point,
conservative outcome arithmetic over caller-supplied damage bounds, a GSI-like
known-unknown assessment, synthetic tests and portable package tooling.
`predictC4Outcome` always returns `unavailable: model-not-qualified` in this foundation.
There is no field parser, extraction CLI, native field lookup or gameplay formula yet.
The `exact` variant is reserved; no current function emits it.

This is a library, not a HUD. It has zero runtime dependencies and no dependency on
RivalHub, React, OBS, Fastify, CSTV or a particular GSI library.
RivalHub-Broadcast may become one downstream consumer.

## Architecture

```text
user-owned CS2 map resource
  → extraction / normalization (planned; start with VRF decompiled input)
  → pure C4 damage engine (contracts only; prediction unavailable)
  → telemetry adapters (GSI-like boundary now; demo/replay and others later)
```

The field contract retains bombsite bounds/power, positions, raw Phase/Yaw/Pitch
and extraction provenance. Field format version, model revision, CS2 build/resource
revision and library SemVer have separate meanings. Unknown or unmatched data must
fail closed. See [architecture](docs/architecture.md) and [model roadmap](docs/model.md).

## API

```ts
import { outcomeFromDamageRange, predictC4Outcome } from 'cs2-c4-damage';
import { assessGsiSnapshot } from 'cs2-c4-damage/gsi';

// Synthetic arithmetic example ONLY; these bounds are not inferred from GSI.
outcomeFromDamageRange(50, { min: 40, max: 60 }, ['ducked']);
// bounded; hpAfter: { min: 0, max: 10 }; lethal: 'indeterminate'

assessGsiSnapshot({ health: 50 });
// Records missing positions/forward, unknown ducked and native spatial corrections.
// predictC4Outcome({ field, bombPosition, playerPosition, playerForward, ducked, health })
// currently returns { status: 'unavailable', reason: 'model-not-qualified' }.
```

`C4Outcome` distinguishes `exact`, `bounded` and `unavailable`; unknown is never zero.
For a proven inclusive damage envelope, lethal is true when its minimum reaches HP,
false when its maximum is below HP, and indeterminate otherwise. Equal endpoints
remain bounded. Bounds must cover all relevant unknowns; sampling two guesses does
not prove an envelope. Arithmetic assumes a living player and standard damage rules.
Invalid health or damage bounds return unavailable. This helper does not qualify inputs.

The GSI entry accepts an **already decoded GSI-like snapshot**, not raw Valve JSON.
It records missing fields and never manufactures crouch state. It does not validate
telemetry, assess freshness, reconcile observer coverage or predict damage.

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

Single package, strict TypeScript, tsup, ESM + CommonJS exports at the root and `/gsi`.
`/node` and a same-package CLI are future options, not current exports.
CI runs Node 22 and 24 on Linux, Windows and macOS. Tests need no CS2 installation;
all fixtures are invented. Real-asset qualification belongs in gitignored
`qualification/`, separate from deterministic CI. See [contributing](CONTRIBUTING.md).

The package is private at version `0.0.0` as an accidental-publication guard.
There is no npm release. Recheck npm-name availability before any authorized publication.

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
