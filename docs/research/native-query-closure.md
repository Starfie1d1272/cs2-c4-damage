# Native query closure

This document records the static closure pass for the current public CS2 build. It
is an implementation boundary, not a native-parity claim. No Windows game process,
injection, hook, RVA lookup or native query was run by this package.

## Evidence identity

The public App 730 branch resolved to build `25218825` on 2026-09-09. The files
used for the static pass were downloaded into the ignored `.agent-tmp/` directory:

| Artifact                                                          | Manifest / size                                            | SHA-256                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `2347770` common depot                                            | `2053759441494650084` / `de_mirage.vpk`, 178,972,399 bytes | `dc8f0d125014b00218582d0ab9a2f684638fa17054924fba34d07c2ef479e268` |
| `2347771` Windows depot, `client.dll`                             | `5806169188224907599` / 37,585,560 bytes                   | `a0c195f0b6ec00915ef08c548200a010ebbe7982d3a4bc468cad939b67c8c4e3` |
| `2347771` Windows depot, `server.dll`                             | `5806169188224907599` / 33,042,584 bytes                   | `1cac9113b10037c0ba8fb739e5538c21d7ddaee5529325ca4f7e9a241fad43cc` |
| `maps/de_mirage/baked_bomb_damage.vdata_c` extracted from the VPK | 712,207 bytes                                              | `ab848262cd263358d4568a7566e492450303d60980e1aaa47b98e07e6f4a7776` |
| `maps/de_mirage/baked_bomb_damage.vdata_c` decompile              | Source 2 Viewer CLI 20.0.6980, 2,953,399 bytes             | `528aad1c4100b91e2b201de2e3594a7305b268eca9d59ebefc4cc36c1ec592de` |

The two DLL hashes exactly match the hashes in the supplied research. The logical
resource was decompiled with ValveResourceFormat revision
`8a322d749c605c36e4e31b4ba34c70a5fd96c884`. The extracted text contains two
bombsites, 68,177 positions and 136,354 records; the record count is exactly
`bombsiteCount * positionCount`.

## Query entry and field call

The matched query ranges are:

```text
client.dll + 0x7E7420 .. 0x7E7745
server.dll + 0x9CE9A0 .. 0x9CECC5
```

The first field sampler is client RVA `0x828530` / server RVA `0xA0BD40`. The
scene-node transform helpers are client `0x21B050` / server `0x3CD640`, and the
documented player-correction helper is client `0x7D9680` / server `0x9C22D0`.
These addresses are recorded as static evidence only and are not present in the
runtime package.

The first arguments are the planted C4, target pawn, damage-byte output and
blast-direction output. The query invokes a target virtual slot at `vtable + 0x2A8`
in the client and `vtable + 0x2C0` in the server, passing an output `Vec3` on its
stack. That vector is then passed to the first baked-field lookup. This proves a
native target-supplied sample coordinate exists, but the inspected static evidence
does not establish whether the slot returns an origin, collision center, eye point,
or another transformed offset. The library therefore never substitutes the GSI
`playerPosition` for it.

Separate helper paths at client RVA `0x21B050` and server RVA `0x3CD640` obtain a
scene-node vector at `node + 0xC8`. The query uses this for the bomb position and a
target transform component in the later correction expression. It is evidence for
the transform source, not proof that it is the first sample point.

The statically supported pseudocode is consequently only:

```text
firstPoint = targetVirtualSampleCall(targetPawn, outputVec3)
bombPosition = bombSceneNodeAbsoluteVector(plantedC4)
first = bakedFieldQuery(bombPosition, firstPoint)
if first failed: return false
```

The unresolved semantic name of `targetVirtualSampleCall` is a qualification gate.

## Q1: native player sample point

Closed evidence: the first lookup consumes the vector written by the target virtual
call above, not an arbitrary GSI coordinate. Partially closed evidence: scene-node
absolute vectors are separately used for bomb/target transform state.

Not closed: the exact vtable slot contract, offset semantics and movement/collision
mode behavior. No external field plus GSI payload can recover that missing native
sample-point truth. `BakedFieldLookupInput.samplePosition` is therefore explicit and
caller-supplied; it is not inferred by the public predictor.

## Q2: ground and collision correction

After a successful first lookup, the query checks target state and a collision pointer
at client `pawn + 0x1248` and server `pawn + 0xA70`. It can call a collision/ground
helper at client RVA `0x8BE900` (with the corresponding server helper in the
`0xAAF980` region). Static inspection shows a trace-like state built from the
collision object, a threshold-like float and engine mask/state inputs. It does not
prove a complete portable contract for start, end, extents, hit-coordinate choice,
or all failure branches.

The required collision truth includes the target collision service and the current
map collision geometry. Neither is present in a baked damage field or ordinary GSI
position/forward/health data. Replacing it with a line trace, player origin, a fixed
height, or a guessed mask would not be fail-closed. The external implementation
does not do so.

Static control-flow result: when the correction gate or helper does not produce the
required result, the original field result remains available for the native query's
later player correction path; an initial field-query failure returns failure. The
portable API marks the missing correction as unknown rather than treating it as zero
or as a successful standing trace.

## Q3: second sample

The second lookup is reached only after the first lookup succeeds and the target
collision/state branch permits the correction helper. The observed second sample
keeps the first sample's x/y and adjusts z using the first sample z, a target scene
transform component and the helper's correction output (initialized to a sentinel
before the helper call). A successful second lookup supplies the corrected field
result; if the correction branch is not taken, the first result remains.

The exact branch predicate, collision-hit coordinate and every second-query failure
priority are not fully recoverable from the available static evidence. The external
engine therefore does not synthesize this position or choose between the two native
results. These are part of the same live differential qualification gate as Q1/Q2.

## Q4: nearest node and site edges

The resource contract and report establish unexpanded bombsite bounds, expansion by
32 units on every axis, and site-major indexing:

```text
recordIndex = positionCount * bombsiteIndex + positionIndex
```

The native parser builds a KD-tree, but the inspected evidence does not prove its
metric precision, tie rule, or overlap traversal order. The library uses an auditable
linear 3D squared-Euclidean scan with lower-index tie stability and the first
expanded-AABB match. These are deterministic internal policies, explicitly included
in field-only output, and are not called native parity.

An outside point, an empty site/position set, a missing record, or a non-finite input
returns unavailable. A boundary point is inclusive after the 32-unit expansion.
Overlapping sites are resolved by source order only for deterministic internal use;
native overlap behavior remains a qualification requirement.

## Implementation consequence

The repository now has:

- a strict Source 2 Viewer text parser and normalized-field validator;
- 32-unit site resolution, deterministic field lookup, raw Phase conversion,
  `/256` direction decoding and the documented Bias/truncation arithmetic;
- an explicit-sample field-only correction helper that can enumerate known
  standing/crouched branches while retaining collision/second-sample unknowns;
- a GSI adapter that validates decoded values, keeps `ducked` unknown and returns
  unavailable when the native inputs cannot be reconstructed;
- a machine-readable qualification harness that binds map, build, DLL/resource
  hashes, decompiled/normalized-field identity, an explicit model revision and the
  `unverified-source-pair` status without tolerance or fabricated native vectors.

Qualification cases may preserve `nativeFailureReason` and a trace containing the first
sample, first/second field results, collision branch/correction, second sample and
selected stage. That trace is evidence-only, not a runtime input. The current harness
compares final native validity and final damage only; it does not by itself close Q1–Q3.
Those questions still require Windows trace instrumentation or equivalent native debug
capture.

`predictC4Outcome` remains unavailable for valid inputs because the native sample,
collision correction and second-sample selection are not externally reconstructable.
This is intentional fail-closed behavior. The only remaining action that requires
Windows/live CS2 is one matched-build differential capture with final vectors and
trace instrumentation to resolve and qualify that complete native path; no static
document or field parse is a substitute for it.
