# Architecture

The core is pure TypeScript without Node, DOM, GSI-library or HUD dependencies.
`src/model-profile.ts` identifies the static semantics separately from library version
and resource provenance. Field parsing/spatial code is under `src/field`, calculations
under `src/engine`, decoded/wire-input adaptation under `src/gsi`, and filesystem/process
operations exclusively under `src/node`. The core never loads DLLs or runs their code.

## Model construction and calls

`createStaticFieldSampler` validates and snapshots the field, builds the native-style
float32 midpoint tree, and exposes explicit-point field queries. `createC4Predictor`
reuses that sampler across snapshots. No mutable global field cache is used. Caller
changes cannot silently corrupt the compiled model; a new resource needs a new model.
Known client/build mismatches and duplicate coordinate mappings are rejected.

`nativeSamplePosition` consumes an effective native collision/scene transform.
`resolveResampling` builds the observed visibility and downward-hull requests for an
injected collision provider. `runStaticSampling` implements first lookup, native
resampling z, fallback on second failure and player correction, and records the trace.
No physics implementation or runtime DLL addresses are part of the core.

The default GSI path lacks those native inputs. It evaluates correlated standing and
crouched sample/correction scenarios, clearly labels its assumptions, and returns
`conditional` with `scope: listed-scenarios-only`. The main API no longer waits for live
qualification before offering those explicitly conditional calculations. It does not
claim an exhaustive envelope over missing states. Unknown collision in the low-level
trace yields `firstPassDamage`, not final damage or a selected stage.

`exact` stays reserved. `bounded` is constructed only by `outcomeFromDamageRange` from
a caller-established envelope; scenario extrema do not enter that helper. A native
query value is a current-state result, never a guarantee of future motion or death.

## Telemetry

`decodeGsiSnapshot` explicitly selects `player` or an `allplayers[steamId]` entry, parses
positions/forward from finite triples or comma-separated strings, and requires a planted
or defusing bomb. It does not infer crouch from custom payload fields. The decoded adapter validates
positive health and a usable forward, rejects provided map-name mismatches, and preserves
missing state. It does not establish synchronization/freshness; conditional results state
that assumption. Use `createGsiC4Predictor` for repeated updates without rebuilding.

## Resource lineage

The parser uses the VRF text representation, not a new Source 2 binary decoder.
Source resource versions 1/2 and normalized formatVersion 1 are independent of the model.
Null hashes/build IDs remain unknown. Manual compiled/text inputs are unverified pairs.
The Node-only self-decompile path runs a pinned executable on a private input snapshot,
validates the generated text and hashes, and records the run's executable identity.
This is evidence of a source pair, not proof of current game matching or qualification.

## Comparison and packaging

`compareSamplingTraces` strictly compares full stage evidence and reports incomplete
for missing stages. The legacy qualification harness's final exact comparison does not
accept conditional or model-unavailable predictions. Native-instruction probes under
`scripts/research` are development tools only; real binaries/resources stay ignored.
The fixtures contain only deterministic synthetic inputs and their calculated outputs.

Root, `/gsi` and `/node` provide ESM/CJS and declarations. Only `/node` uses Node APIs
or launches a caller-selected decompiler. Package allowlisting excludes research tools,
fixtures, all game assets and telemetry. The package has zero runtime npm dependencies.
GitHub Actions verifies the package across platforms and publishes tagged releases through
the [npm workflow](releasing.md).
