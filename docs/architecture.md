# Architecture foundation

## Ownership and dependency direction

- `src/field`: data-only normalized field contracts; future deterministic parsing and validation live here.
- `src/engine`: pure functions consuming field contracts, no Node, DOM or telemetry dependencies.
- `src/gsi`: separate public entry importing only field types; describes decoded telemetry and known unknowns.
- Future Node extraction tooling stays outside core, optionally under `/node` with a same-package `bin`.

No plugin/provider framework or monorepo is needed. The core does not import adapters.
The long-term flow is user-owned resources → extraction/normalization → engine →
telemetry integrations. At call time adapters translate snapshots into engine inputs.

## Field contract (provisional)

`BombDamageField` contains metadata, unexpanded bombsite AABBs/power, world positions
and records. Records use bombsite-major indexing; a site index is not an A/B label.
Phase is a raw uint16 and Yaw/Pitch raw uint8 values, not HP or degrees. These are
TypeScript contracts, not runtime validators; no caller-provided field is trusted for prediction.

The first parser should consume a documented VRF/Source 2 Viewer decompiled representation.
No full Source 2 binary system will be reimplemented for this foundation.
A future parser must deterministically reject malformed/nonfinite coordinates,
inverted bounds, fractional/out-of-range packed fields, inconsistent record counts,
unsupported versions, malformed hashes and missing required provenance. It must distinguish
syntax validation from model qualification. Neither is implemented yet.

`formatVersion: 1` describes this project's proposed normalized shape;
`sourceResourceVersion: 1 | 2` describes the source payload version.
`modelRevision` identifies qualified semantic rules, not an npm version.
`sourceBuildId` and `resourceSha256` may be null to represent unknown provenance;
non-null strings do not prove correctness. Extractor identity/revision and map name
must also be retained. A future qualification record must bind all relevant identities
to evidence; no user-set `qualified: true` flag should enable exact predictions.

## Outcome semantics

`predictC4Outcome` is a deliberate fail-closed entry point, always unavailable now.
Its input includes field, bomb and player positions, player forward, explicit
`boolean | undefined` ducked state, and health. This is not a promise that those inputs
alone will suffice for native correction; the contract may evolve before release.

`outcomeFromDamageRange` accepts a caller-established inclusive integer [0,255] range
and positive safe-integer HP. It computes reverse-ordered HP bounds and threshold
lethality. It never derives a field envelope or emits exact. A singleton range remains
bounded and retains unknowns. Invalid inputs return unavailable; dead players are
outside this helper's domain. Standard damage rules are assumed.

`exact` means exact within a qualified model, resource and complete current-state
snapshot, never a guarantee about future motion or actual future death.
No foundation function currently constructs that variant.

## GSI boundary

`GsiSnapshot` is a small decoded-input shape, not the full Valve wire schema. Field
availability depends on payload configuration, perspective and game state. The current
assessment reports omitted keys plus ducked, native sample point and ground/collision
correction. It does not parse strings, establish sample time, validate numbers or select
players. These are explicit adapter qualification tasks before prediction becomes usable.
A supplied extra crouch field does not become native `m_bDucked` evidence.

## Packaging

Root and `/gsi` exports provide separate ESM/CJS declaration and runtime paths.
Core has zero runtime dependencies, neutral-platform compilation and no Node/DOM calls.
Only dist and selected license/readme files are allowlisted for future packaging.
Research and game resources are not published. `private: true` guards publication.
The `/node` export, CLI and release workflows are deferred.
