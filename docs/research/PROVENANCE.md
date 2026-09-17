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
The source includes binary hashes and local evidence paths, but those binaries and
underlying offline evidence are not supplied, copied or independently re-audited here.

The client HUD query, server actual-damage chain, ABI, integer/failure output, stance /
facing corrections and armor semantics are the author's findings. This repository's
external API, uncertainty model, arithmetic and synthetic tests are subsequent work.
Static reverse engineering is strong scoped evidence; it is not dynamic parity.

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
A raw GSI parser is deliberately not claimed or implemented. Qualification must capture
real, configured payloads and synchronize them with native sample observations.

No other public implementation is relied upon by this foundation. Older distance-only
C4 calculators are not evidence for the current baked-field entity query.
Any future source reuse requires license compatibility and attribution review.
