# Map resources

A predictor consumes a normalized `BombDamageField`: bombsite bounds and powers,
sample-node positions, packed damage records, and source metadata. Construct it once
per map/resource revision and reuse it across player updates.

## Extract and normalize

1. Open your local map VPK with [Source 2 Viewer](https://s2v.app).
2. Extract `maps/<map>/baked_bomb_damage.vdata_c`.
3. Obtain the Source2Viewer-CLI for your platform and calculate its executable SHA-256.
4. Run `cs2-c4-damage extract` as shown in the README, with the map and matching build ID.
5. Use `inspect` to check the metadata and node/record counts before loading the field.

The self-decompile path copies the compiled resource into a temporary directory,
executes the selected tool, reads its text output, verifies input/tool stability and
records `self-decompiled-source-pair`. The metadata includes the compiled resource,
decompiled text, canonical field and executable hashes. Node applications can call
`extractFieldFromCompiled` directly.

For text you have already exported:

```sh
npx cs2-c4-damage extract \
  --vdata /your/resources/baked_bomb_damage.txt \
  --compiled /your/resources/baked_bomb_damage.vdata_c \
  --map de_mirage --build-id 25687242 \
  --out /your/resources/mirage.json
```

This records independent hashes with `unverified-source-pair`. Additional options are
`--client-sha256`, `--extractor`, `--extractor-revision` and `--model-revision`.

## Version identities

| Identity                | Current value / purpose                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| npm package version     | Library API and distribution version; see `package.json`.              |
| `modelRevision`         | `cs2-win64-2026-10-02-static-v2`: calculation and traversal semantics. |
| `sourceBuildId`         | Supported static profile: `25687242`.                                  |
| `sourceClientSha256`    | `d7db25d48f1d10c5e0b0296e20ed803426eb9509da41760daeda39dd35ba89b9`.    |
| `formatVersion`         | Normalized JSON schema version `1`.                                    |
| `sourceResourceVersion` | Source 2 resource version `1` or `2`.                                  |

The parser defaults to the current model revision. Existing JSON keeps its recorded
revision. A known conflicting client/build is rejected; missing identities appear in
`unknownInputs`. Re-extract matching resources when updating a field, rather than
changing its identity labels. New game builds may require a new model profile.

The v2 sampler validates finite coordinates, record layout and unique node positions.
Duplicate-coordinate fields are currently rejected. The verified Mirage resource has
68,279 unique nodes and two bombsites; other maps must supply their own matching fields.

## Loading and updating

`readNormalizedField(path)` validates JSON in Node. Browser applications can fetch JSON,
validate it with `validateField`, then pass it to `createGsiC4Predictor` or
`createC4Predictor`. Both constructors snapshot the field and compile its tree.
Replace the predictor when the map or resource changes. See the exported TypeScript
types for metadata and validation results.

## Resource handling

Game binaries, VPKs, vdata and real telemetry remain outside the npm package and repository.
For local development, use ignored `qualification/`. Only run a decompiler executable
you trust; its hash identifies the selected tool. Source-pair metadata records lineage
of that extraction, while game-build matching is established by the supplied identities.
