# Research provenance

## Primary input: unicbm

Author: [unicbm](https://github.com/unicbm). Supplied on 2026-09-17 by the project
maintainer as `c4-damage-hud-native-2026-09-17.zh-CN.md`.
The [original](c4-damage-hud-native-2026-09-17.zh-CN.md) is preserved byte-for-byte.
SHA-256: `e3d85e2c9c4625c3fed0b9a5c58136caf299c0ec4ae2831e5febdd4b9ab6a831`.
Formatting and Git line-ending conversion are disabled for that file.

Copyright belongs to unicbm; reproduced and used with permission recorded in
[authorization](authorization.md), not relicensed as Apache-2.0. Its native calling /
hooking suggestions describe the author's original research context, not this
library's architecture. No addresses or signatures are used by runtime code.
The source includes binary hashes and local evidence paths. The binaries used for the
current static recheck were downloaded into gitignored `.agent-tmp/` only; they are
not supplied, copied or committed.

The client HUD query, server actual-damage chain, ABI, integer/failure output, stance /
facing corrections and armor semantics are the author's findings. This repository's
external API, uncertainty model, arithmetic and synthetic tests are subsequent work.
Static reverse engineering is strong scoped evidence; it is not dynamic parity.

## 2026-10-03 follow-up

The [new audit](static-audit-2026-10-03.zh-CN.md) records different public manifests,
client/server/tier0 hashes, a directly extracted and twice-decompiled Mirage resource,
the executable decompiler identity, and synthetic instruction-replay boundaries.
The old manifest was inaccessible anonymously, so the newer DLLs do not revalidate
the original report's binary identity. In particular, the newer DLLs use `/255`
direction decoding; the existing external `/256` baseline is not native parity.

The research probe is independently authored and reads instructions only
from user-supplied, hash-pinned files. PE parsing and CPU emulation use pefile and
Unicorn in an isolated Python environment; neither is a library runtime dependency.
No upstream implementation or binary bytes were copied into this repository.

## Historical static recheck

On 2026-09-18 the public App 730 branch resolved to build `25218825`. The common
depot manifest was `2053759441494650084`; the Windows depot manifest was
`5806169188224907599`. The downloaded `client.dll` and `server.dll` SHA-256 values
were respectively `a0c195f0b6ec00915ef08c548200a010ebbe7982d3a4bc468cad939b67c8c4e3`
and `1cac9113b10037c0ba8fb739e5538c21d7ddaee5529325ca4f7e9a241fad43cc`, exactly
matching the supplied report. The downloaded `de_mirage.vpk` SHA-256 was
`dc8f0d125014b00218582d0ab9a2f684638fa17054924fba34d07c2ef479e268`; the extracted
`maps/de_mirage/baked_bomb_damage.vdata_c` was 712,207 bytes with SHA-256
`ab848262cd263358d4568a7566e492450303d60980e1aaa47b98e07e6f4a7776`. Its logical
resource was then decompiled to a temporary text artifact with SHA-256
`528aad1c4100b91e2b201de2e3594a7305b268eca9d59ebefc4cc36c1ec592de`.

The static query/control-flow conclusions and their unresolved boundaries are in
[native-query-closure](native-query-closure.md). No dynamic Windows/native vectors
were captured, so this recheck does not change the project's qualification status.

## Public prior art inspected on 2026-09-17

### ValveResourceFormat / Source 2 Viewer

Project: [Source 2 Viewer](https://s2v.app),
[ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat).
Pinned revision: `8a322d749c605c36e4e31b4ba34c70a5fd96c884`.

- [BombDamage.cs](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/8a322d749c605c36e4e31b4ba34c70a5fd96c884/ValveResourceFormat/Resource/ResourceTypes/GenericData/CS2/BombDamage.cs): generic data identifier `CS2_BOMB_DAMAGE_DATA`, versions 1/2, bombsite/position/record arrays and bombsite-major indexing.
- [BombDamageBombsite.cs](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/8a322d749c605c36e4e31b4ba34c70a5fd96c884/ValveResourceFormat/Resource/ResourceTypes/GenericData/CS2/BombDamageBombsite.cs): unexpanded bounds and power metadata.
- [BombDamageDamageValue.cs](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/8a322d749c605c36e4e31b4ba34c70a5fd96c884/ValveResourceFormat/Resource/ResourceTypes/GenericData/CS2/BombDamageDamageValue.cs): packed Phase/Yaw/Pitch representation.
- [License at inspected revision](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/8a322d749c605c36e4e31b4ba34c70a5fd96c884/LICENSE): MIT. Upstream README excludes game-derived test assets from its general licensing statement.

This is format reference and the intended extraction route for user-owned
`maps/<map>/baked_bomb_damage.vdata_c` resources. The native report refers to the
logical `.vdata` resource name. VRF's decoder and field-level calculation do not by
themselves establish complete entity-query parity. No code was copied, translated or
vendored, and no upstream test/game assets were imported. New schema types describe
format facts; they do not implement the upstream decoder or formula.

### Valve July 2026 update

[Official Steam update archive for app 730](https://store.steampowered.com/news/posts/?appids=730&enddate=1784076119)
was checked for July 8 and July 9: precomputed map damage, expanding shockwave,
removal of minimum map-wide damage and boundary fixes. The
[official Counter-Strike update page](https://www.counter-strike.net/news/updates?l=english)
is another canonical entry point but did not expose readable content to this retrieval.
No patch note proves stance formulas or full external parity.

### GSI documentation and evidence boundary

[Valve Developer Community GSI documentation](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration)
is a follow-up reference; retrieval returned HTTP 403 during initialization, so its
current content was not independently verified. The supplied project requirements
establish the current position/forward/HP and missing crouch constraints used here.
The current adapter decodes the selected player and planted/defusing bomb fields used
by the model. Future live qualification will pair configured payloads with synchronized
native sample observations.

No other public implementation is relied upon by this library. Older distance-only
C4 calculators are not evidence for the current baked-field entity query.
Any future source reuse requires license compatibility and attribution review.

## Extractor source-pair boundary

The Node extractor hashes the user-supplied compiled resource and decompiled text
independently, then records both hashes and a canonical normalized-field hash. It marks
the metadata `sourcePairStatus` as `unverified-source-pair` for independently supplied
files. The self-decompile path instead records its actual tool execution and resulting
source pair, as described below. Qualification vectors bind the corresponding identities.

## Implemented v2 follow-up

`cs2-win64-2026-10-02-static-v2` implements the new arithmetic, full midpoint
KD-tree and two-sweep partition, sample transform, and resampling state machine.
`scripts/research/probe_static_model.py` generates only deterministic synthetic inputs
and numeric outputs from the pinned client/tier0 instructions. The committed JSON
oracle contains no Valve resource data, machine-code bytes or real telemetry.
Its 183 built-tree queries, 256 sin/cos byte values, 400 Bias cases and 72 remap cases
match TypeScript without tolerance. The original 40-probe suite remains separate.

The Node extractor now has a self-decompile path that records the actual pinned tool
run as `self-decompiled-source-pair`, including executable identity. Manual independent
compiled/text input remains unverified. The new path was exercised on the same private
Mirage compiled resource; its text and normalized payload hashes match the audit.
No new binaries, map assets or private records are distributed. See the current
[model](../model.md) for conditional-result assumptions and remaining native evidence gaps.
