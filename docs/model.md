# Model and API

The active revision is `cs2-win64-2026-10-02-static-v2`, associated with build `25687242`
and the client identity exported as `STATIC_CLIENT_SHA256`. Package SemVer, model revision
and resource identity are independent; see [resources](resources.md) for the metadata.

## Predictors

| API                                    | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `createGsiC4Predictor(field)`          | Compile a field once and predict from decoded GSI snapshots. |
| `decodeGsiSnapshot(payload, steamId?)` | Decode the selected player and planted/defusing bomb fields. |
| `createC4Predictor(field)`             | Compile a field once and predict from direct state inputs.   |
| `predictC4Outcome(input)`              | One-shot direct prediction; input includes `field`.          |
| `createStaticFieldSampler(field)`      | Compile a field for explicit sample-point lookups.           |
| `runStaticSampling(sampler, input)`    | Execute the sampling state machine and return its trace.     |

Prepared predictors copy the field and build its tree once. Replace the predictor when
changing maps or resources. Constructors throw for invalid/unsupported fields; prediction
calls return `unavailable` for unresolved inputs or field queries. Known conflicting
build/client identities and duplicate node coordinates are rejected.

## Results

A `conditional` result contains:

| Field                          | Meaning                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `damage`, `hpAfter`            | `{ min, max }` over the evaluated scenarios.                                         |
| `lethal`                       | `true` if every scenario is lethal, `false` if none is, otherwise `'indeterminate'`. |
| `scenarios`                    | Each posture, sample position, damage, HP, lethal flag and trace.                    |
| `assumptions`, `unknownInputs` | State assumptions and missing information used in the calculation.                   |
| `scope`                        | `listed-scenarios-only`.                                                             |
| `modelRevision`, `evidence`    | Calculation revision and `static-reconstruction` evidence type.                      |

An `unavailable` result includes a `reason`. The broader `C4Outcome` type also includes
`bounded`, used by `outcomeFromDamageRange` for a caller-established envelope, and
`exact`, reserved for qualified native parity. The current predictors produce
`conditional` or `unavailable`.

## GSI scenarios

The default GSI path evaluates correlated standing and crouched sampling/correction
scenarios. Direct callers can supply `ducked: true` or `false` to choose one posture.
The scenario inputs are:

- GSI position as absolute pawn origin, and forward as the native view direction.
- Upright, unscaled, symmetric hulls: 72 units standing or 54 units crouched.
- The first field result retained through the ground-resampling stage.
- A current, synchronized snapshot and matching map under standard damage rules.

Near-unit forward values are preserved. Other nonzero finite forward values are
normalized, with `forward-renormalized` recorded in the assumptions.

## Supplying sample and ground state

`nativeState` replaces the default hull and resampling assumptions:

```ts
const result = predict({
  bombPosition,
  playerPosition,
  playerForward,
  health,
  ducked,
  nativeState: {
    sample: {
      origin,
      collision: {
        mins,
        maxs,
        scale,
        orientation: { kind: 'axis-aligned' },
      },
    },
    resampling: { kind: 'ground-hit', groundZ },
  },
});
```

The effective orientation can also be a unit quaternion:
`{ kind: 'quaternion', x, y, z, w }`. Use `collision: null` when the native collision
object is explicitly absent; the sample then uses the origin. `resampling` accepts
`{ kind: 'skip', reason }`, `{ kind: 'unknown' }`, a ground hit, or a `CollisionContext`.

### Collision provider

A `CollisionContext` supplies the native eligibility gate, origin, selected
normal/ducked/special hull, maximum-coordinate configuration and a pure query callback.
`resolveResampling` issues:

1. A visibility ray, mask `1`, group `3`.
2. When obstructed, a downward hull query from the origin with filter fields
   `0xC3011`, `0x48100`, `0x40000`, group `11`.

The provider implements map/dynamic collision geometry, entity/owner exclusions and
native callback semantics. It returns `clear`, `hit` with `endPosition`, or `unknown`.
Exceptions and missing required state become `unknown`. A miss retains the first result;
a hit supplies the ground z. The library builds the requests and sampling transitions;
the host supplies the physics service.

## Sampling and arithmetic

The v2 implementation performs:

- Inclusive bombsite AABB lookup expanded by 32 units, first matching site, site-major records.
- Float32 midpoint KD-tree construction with the native axis ties, two-sweep partition,
  eight-point leaf threshold, near-first traversal and strict distance/plane comparisons.
- Float32 Phase/power remapping, native truncation/clamping, `/255` byte-angle decoding,
  and stance/facing Bias using the reconstructed constants and operation order.
- Collision-center sampling with effective orientation, scale and absolute origin.
- Second sampling at `z = f32(f32(first.z - origin.z) + groundZ)`.

A successful second lookup replaces damage and direction; a failed second lookup retains
the first result. A failed first lookup ends the query. With unknown collision state,
`runStaticSampling` returns `firstPassDamage` and leaves final damage/stage unset. The GSI
scenario uses that first-pass value under its explicit retention assumption.

Historical helpers (`decodeBlastDirection`, `scaleDamage`, `calculateRawFieldDamage`,
`findNearestPosition`) retain their original external-model semantics. Use prepared v2
predictors or `staticBlastDirection`, `staticScaleDamage`, `staticRawDamage` for v2.
Field-only helpers dispatch by the field's `modelRevision`.

## Traces and verification

`compareSamplingTraces(expected, actual)` compares the first sample/result, resampling,
second sample/result, selected stage and final damage, reporting differing paths.
Complete equal evidence returns `matched`; missing stages return `incomplete`;
differences return `mismatch`. The CLI exposes this as `compare-traces`.

The versioned qualification harness binds map/build, binary/resource hashes and model
revision to reference vectors. Its exact comparison keeps conditional or unavailable
predictions unresolved, including native-invalid cases. Source-pair validation also
binds the decompiler executable hash for self-decompiled resources.

Synthetic tests cover 183 native built-tree queries, 256 encoded sin/cos angles, 400
Bias cases and 72 Phase/power cases, matching those native instruction outputs without
tolerance. A separate 40-probe suite covers query branches, sampling transforms and
helper inputs. Details and transform tolerances are recorded in
[provenance](research/PROVENANCE.md) and the [static audit](research/static-audit-2026-10-03.zh-CN.md).

## Accuracy

Scenario extrema cover the listed states, not all missing collision or posture states.
Providing native state reduces assumptions; live trace/applied-damage qualification is
still needed for full native parity. Dynamic obstacles, ground correction and unusual
transforms may prevent exact simulation from GSI alone.
