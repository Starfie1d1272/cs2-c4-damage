# Contributing

Read README, docs/architecture.md, docs/model.md and research provenance first.
Correctness, explicit uncertainty and provenance precede performance. Keep changes small.
Use Node >=22 and the pnpm version in package.json. Install with `pnpm install`, then run
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:package`.
Use `pnpm format` for project-owned files only; the original research is excluded.

Tests must use synthetic fixtures with explicit invented-data provenance. Do not
require CS2 in deterministic CI. Keep private resource experiments and evidence under
ignored `qualification/`; never add game binaries, VPKs or complete vdata assets.
Avoid telemetry containing identifying or private information.

Changes to model semantics need scoped evidence, resource/build identity and later
dynamic qualification. A roadmap item or formula seen in another project is not a parity
result. Do not replace unknown state with zero/standing, or relax fail-closed behavior
without proving an exhaustive envelope. Review licenses before reusing third-party code;
no incompatible or unknown-license code may enter this Apache-2.0 implementation.

Use Conventional Commits: `type(scope): summary`; no Co-Authored-By trailer.
Review diffs and untracked files before commits. Keep semantic changes independently
reviewable. Core must remain independent of Node, DOM, GSI and downstream applications.
Contributions of new code are under Apache-2.0; that does not change the research exception.

No npm release is authorized by initialization. Publication requires an explicit decision,
name-availability check, package-content audit, license review and removal of the private
guard. Do not describe the foundation as production-ready.
