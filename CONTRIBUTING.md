# Contributing

Use Node.js 22 or later and the pnpm version in `package.json`. Read
[architecture](docs/architecture.md), [model](docs/model.md) and
[provenance](docs/research/PROVENANCE.md) before changing calculation semantics.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
```

CI runs these checks on Linux, Windows and macOS with Node.js 22 and 24.
`pnpm format` formats project-owned files; the original research is excluded.

## Implementation and tests

Keep the core independent of Node, DOM, GSI libraries and downstream applications.
Use synthetic deterministic fixtures with clear input provenance. Keep real-resource
experiments in ignored `qualification/`; fixtures and commits must not contain game
assets, credentials or identifying telemetry.

Model changes need scoped evidence and a model revision distinct from package SemVer
and game build identity. Preserve unknown state and document the assumptions of new
scenarios. Native instruction probes belong in `scripts/research`; the normal test suite
runs their synthetic fixtures without requiring CS2. Live comparison can be contributed
separately through the versioned trace and qualification interfaces.

Keep `README.md` and `README.zh-CN.md` aligned, update the relevant API guide, and record
user-visible changes in `CHANGELOG.md`. Preserve the original unicbm research file
byte-for-byte. Review third-party licenses before source reuse; new code is Apache-2.0.

## Submitting changes

Use Conventional Commits (`type(scope): summary`) without Co-Authored-By trailers.
Inspect the complete diff and untracked files before committing. Explain behavior and
validation in pull requests. See [releasing](docs/releasing.md) for the maintained npm
workflow and [security](SECURITY.md) for vulnerability reporting.
