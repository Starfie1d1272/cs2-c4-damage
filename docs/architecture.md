# Architecture foundation

## Ownership and dependency direction

- `src/field`: normalized field contracts, strict Source 2 Viewer parsing/validation and deterministic spatial policies.
- `src/engine`: pure functions consuming field contracts, no Node, DOM or telemetry dependencies.
- `src/gsi`: separate public entry for decoded telemetry, input validation and fail-closed prediction routing.
- `src/node`: Node-only file extraction, normalized-field I/O, summary and CLI; it is not imported by core.

No plugin/provider framework or monorepo is needed. The core does not import adapters.
The long-term flow is user-owned resources → extraction/normalization → engine →
telemetry integrations. At call time adapters translate snapshots into engine inputs.

## Field contract and parser

`BombDamageField` contains metadata, unexpanded bombsite AABBs/power, world positions
and records. Records use bombsite-major indexing; a site index is not an A/B label.
Phase is a raw uint16 and Yaw/Pitch raw uint8 values, not HP or degrees. The parser
and validator reject malformed/nonfinite coordinates, inverted bounds, unsupported
versions, empty field arrays, malformed hashes and inconsistent record counts. Blob
properties must bind directly to their `#[...]` value and the resource version must be
read from `header.version`; no caller-provided field is trusted for prediction without
validation.

The parser consumes a documented VRF/Source 2 Viewer decompiled representation.
No full Source 2 binary system will be reimplemented for this foundation.
Parser syntax/provenance validation is distinct from model qualification. A successful
parse does not establish that the field reproduces the native entity query.
Packed integer widths are validated at decode time; no narrower gameplay-domain range
for Phase or coordinate/power values is invented beyond the proven resource contract.

`formatVersion: 1` describes this project's proposed normalized shape;
`sourceResourceVersion: 1 | 2` describes the source payload version.
`modelRevision` identifies qualified semantic rules, not an npm version.
`sourceBuildId`, `resourceSha256`, `decompiledVdataSha256` and
`normalizedFieldSha256` may be null to represent unknown provenance; non-null strings do
not prove correctness. Extractor identity/revision and map name must also be retained.
The current `sourcePairStatus` is explicitly `unverified-source-pair`: the Node extractor
hashes supplied compiled/decompiled inputs but does not decompile the compiled resource
itself. Qualification vectors bind the available identities and this limitation to
evidence; no user-set `qualified: true` flag should enable exact predictions.

## Field and outcome semantics

`lookupBakedField` implements the external field-only calculation when the caller
supplies an explicit target sample point. Its linear squared-Euclidean/lower-index
nearest policy and first-overlap site policy are deterministic internal policies,
not proven native tie behavior. `evaluateBakedFieldCorrection` preserves collision
and second-sample unknowns.

`predictC4Outcome` is a deliberate fail-closed entry point. For a valid field and
well-formed external positions/forward/health it remains unavailable until the native
sample point, collision correction and second sample are dynamically qualified.
Its input includes field, bomb and player positions, player forward, explicit
`boolean | undefined` ducked state, and health. `undefined` is never treated as standing.

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
assessment validates positions, forward and positive health, then reports ducked,
native sample point, ground/collision correction and second-sample uncertainty. It does
not parse strings, establish sample time, validate freshness or select players. A
supplied extra crouch field does not become native `m_bDucked` evidence.

## Packaging

Root, `/gsi` and `/node` exports provide separate ESM/CJS declaration and runtime paths.
Core has zero runtime dependencies, neutral-platform compilation and no Node/DOM calls;
only `/node` uses Node APIs. The CLI reads user-owned resources but does not vendor
them. Only dist and selected license/readme files are package-allowlisted. Research and
game resources are not published. `private: true` guards publication; npm/release
workflows remain out of scope. Qualification traces are evidence records; the current
harness compares final native validity/damage and does not claim to close Q1–Q3 without
Windows trace capture.
