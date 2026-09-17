# Model evidence and qualification status

This is an evidence and qualification boundary, not a claim of native parity.
Primary evidence: [unicbm's original report](research/c4-damage-hud-native-2026-09-17.zh-CN.md).
Public sources and their limitations: [provenance](research/PROVENANCE.md).
The current static query closure is recorded in [native-query-closure](research/native-query-closure.md).

## Strong static evidence in the supplied build

The report audits Windows x64 client/server binaries identified by their hashes,
not an established universal CS2 build ID. It reports a closed HUD → query and server
shockwave → actual damage → query chain; a bool success return, byte damage and vector
output; failure distinct from zero; resource versions 1/2 and nearest-node field use;
bombsite AABB selection with 32-unit expansion; phase/power conversion; possible spatial
resampling; integer truncation and clamp; stance and facing Bias corrections only below
100 damage; and ignore-armor semantics for standard C4 damage.

Crouch's 0.45 is a nonlinear Bias parameter, not a multiplier. Facing depends on the
field direction and native forward. Raw records are not HP. Those findings are attributed
to unicbm and remain scoped to the inspected build. The report did not perform dynamic
prediction-vs-applied-damage tests and did not audit Linux. DLL signatures and RVAs are
research evidence only, never library runtime dependencies.

Valve's July 8 notes independently establish precomputed map damage and shockwave travel.
July 9 removed the map-wide one-HP minimum and fixed boundary behavior. These changes
show why older radius/armor formulae and unversioned data cannot silently serve as fallback.
The original report also cites a July 20 HUD-timing change; this repository has not
independently verified that particular update and does not depend on it.

## Implemented external model

The parser validates Source 2 Viewer text, packed little-endian field data,
finite/bounded values, exact record cardinality and provenance. The field-only model
implements 32-unit AABB expansion, bombsite-major indexing, deterministic 3D nearest
lookup, the documented Phase/power conversion, yaw/pitch `/256` direction decoding,
integer truncation and the crouch/facing Bias arithmetic.

`lookupBakedField` requires an explicit sample point and reports its internal
nearest/overlap policy. `evaluateBakedFieldCorrection` can enumerate known
standing/crouched arithmetic, but retains `ground-collision-correction` and
`native-second-sample-selection` as unknown. These helpers are not native parity and
do not emit a conservative native damage envelope.

`outcomeFromDamageRange` remains the only model-independent route to a `bounded`
outcome. `predictC4Outcome` and the GSI prediction adapter return `unavailable` for
valid external inputs until a matched-build native qualification establishes the
missing semantics. No current function emits `exact`.

## Current qualification gates

| Question                           | Current static conclusion                                                                                                                   | External status                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Native spatial sample point        | A target virtual call writes the first field-query `Vec3`; exact origin/center/eye/offset semantics are not proven.                         | fail closed                        |
| Ground-height/collision correction | The query depends on target collision state and map collision geometry not present in field+GSI.                                            | fail closed                        |
| Second-sample condition            | A gated second lookup reuses x/y and adjusts z from native transform/correction state; exact predicate and failure priority are incomplete. | fail closed                        |
| Exact field lookup                 | Resource indexing and 32-unit expansion are supported; KD-tree metric, ties and overlap traversal are not proven.                           | deterministic internal policy only |
| Phase/direction conversion         | Static formula and byte-angle conversion are implemented and unit-tested; live native output comparison is absent.                          | qualification-ready                |
| Arbitrary-position behavior        | Outside/no-node/missing-record paths are unavailable; no legacy/radius fallback is used.                                                    | fail closed                        |
| GSI vs pawn coordinates            | GSI position/forward/HP do not establish the native target sample or collision truth; crouch stays unknown.                                 | unavailable                        |
| Build changes                      | Resource/DLL/build/model identity is bound by metadata and vector checks.                                                                   | reject mismatch                    |

The deterministic suite covers the 99/100 transition, Bias rounding boundaries,
forward-vector precision, parser edges, site/nearest policies and fail-closed GSI
inputs. A native query value is a current-state conditional prediction, not a future
lethal guarantee; live work must additionally compare synchronized native vectors and
actual applied damage under standard rules.

## Missing external inputs and uncertainty policy

GSI currently lacks reliable native `m_bDucked`. It also does not establish the exact
native spatial sample, collision result or ground correction. Position, forward and HP
can be exposed but may be missing or stale. No claim is made that Valve can never add
these fields; they are current limitations. Map/resource identity must be supplied and verified separately.

- Unknown ducked can eventually be enumerated across true/false **only after** both
  branches and every other necessary input are qualified. Never default to standing.
- Facing or spatial uncertainty can be bounded only with a proven exhaustive envelope,
  not guessed extrema or a pair of sample positions. All unknowns remain recorded even
  if the lethal conclusion is invariant or damage endpoints coincide.
- Unbounded spatial/collision uncertainty, missing fields, unsupported maps, unknown
  build/resource matching, invalid data or missing qualification must yield unavailable.
- Absence of baked data is unavailable. Native legacy fallback exists per the report,
  but this library does not implement or silently substitute it.

## Private qualification workflow

Use user-owned resources under gitignored `qualification/`; never commit or npm-publish
VPKs, DLLs or complete vdata resources. The `qualify <vectors.json> <field>` command
requires exact map/build/client/resource/model identity and reports pass/fail totals,
mismatches and unresolved cases without tolerance. Vector cases use decoded Vec3
objects or JSON triples and must record whether the native query itself was valid;
this repository does not fabricate native vectors.

Record exact build, map/resource SHA-256, extractor revision, platform, model revision,
standard game rules and synchronized inputs with expected native query and actual
applied outcomes. Obtain observations through a separately authorized research setup;
this package provides no injection, hooks or native-RVA execution. Define numeric and
coverage acceptance criteria before claiming parity. Publish only permissible aggregate
evidence and synthetic regressions.
