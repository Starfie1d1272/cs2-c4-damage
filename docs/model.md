# Model evidence and qualification roadmap

This is a research status document, not a list of implemented gameplay features.
Primary evidence: [unicbm's original report](research/c4-damage-hud-native-2026-09-17.zh-CN.md).
Public sources and their limitations: [provenance](research/PROVENANCE.md).

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

## Implemented semantics

Only arithmetic over a supplied conservative damage range: HP is clamped at zero;
lethal is true for an entirely lethal range, false for an entirely surviving range,
and indeterminate when crossing HP. Invalid ranges/HP are unavailable. No current
function emits exact. GSI assessment preserves known gaps. Prediction always fails closed.

## Unlocked semantics requiring qualification

| Question                           | Evidence to collect before implementation/qualification                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Native spatial sample point        | Trace entity coordinate sources, offsets and movement modes in matched builds.                  |
| Ground-height/collision correction | Derive exact trace geometry, collision inputs, thresholds and order.                            |
| Second-sample condition            | Establish branch conditions, positions, failure handling and result selection.                  |
| Exact field lookup                 | Confirm nearest-node distance metric, ties, precision, site overlap and AABB edge behavior.     |
| Phase/direction conversion         | Qualify scalar conversion, saturation, angle conventions and truncation against native outputs. |
| Arbitrary-position behavior        | Test outside sampled regions, out of map, between floors and ambiguous sites.                   |
| GSI vs pawn coordinates            | Compare synchronized telemetry with native sample points, ducking and observer modes.           |
| Build changes                      | Requalify resource, model and platform after Valve updates; reject unknown combinations.        |

Also test the 99/100 transition, Bias rounding boundaries, forward-vector precision,
standard-rule assumptions, shockwave arrival timing, stale snapshots and demo seeks.
A native query value is a current-state conditional prediction, not a future lethal guarantee.

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

## Private qualification workflow (planned)

Use user-owned resources under gitignored `qualification/`; never commit or npm-publish
VPKs, DLLs or complete vdata resources. Record exact build, map/resource SHA-256,
extractor revision, platform, model revision, standard game rules and synchronized
inputs with expected native query and actual applied outcomes. Obtain observations
through a separately authorized research setup; this package provides no injection,
hooks or native-RVA execution. Define numeric and coverage acceptance criteria before
claiming parity. Publish only permissible aggregate evidence and synthetic regressions.

No qualification harness or real-asset workflow is implemented in this initialization.
The three highest-value next questions are the native sample point, correction/second
sample control flow, and exact lookup/conversion with build-bound dynamic comparisons.
