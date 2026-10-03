# Changelog

Package versions describe the public library API. Model revisions and CS2 build
identities are recorded separately in resource metadata.

## 0.1.0-beta.1

Initial npm prerelease, prepared for publication.

### Added

- Reusable C4 predictors for direct state and GSI snapshots, with damage, remaining HP,
  lethality and individual standing/crouched scenarios.
- Static v2 float32 arithmetic, `/255` direction decoding, midpoint KD-tree traversal,
  collision-center transforms and second-sample selection/fallback.
- Source 2 Viewer extraction with executable hashing and source-pair metadata.
- Per-stage sampling traces, trace comparison and versioned qualification tooling.
- ESM/CJS and TypeScript exports for the core, GSI adapter and Node helpers, plus a CLI.
- Synthetic native-instruction oracle fixtures, package smoke checks and GitHub Actions
  verification/publication workflows.

### Fixed

- Unavailable and conditional predictions no longer count as exact native-failure matches.
- Repository ignores now distinguish private qualification assets from qualification source.

### Compatibility

The active model is `cs2-win64-2026-10-02-static-v2` for build `25687242`.
Historical low-level helpers retain their original semantics; prepared predictors and
`static*` helpers use v2. See [model](docs/model.md) for the API and scenario definitions.
