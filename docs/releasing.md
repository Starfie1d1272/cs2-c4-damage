# Releasing

The repository uses GitHub Actions for CI/CD. `ci.yml` tests Linux, Windows and macOS
on Node.js 22/24. `publish.yml` builds, checks and publishes a tagged version to npm.
The initial release version is `0.1.0-beta.1`, distributed under the npm `beta` tag.

## npm authorization

`0.1.0-beta.1` was published on 2026-10-03 through interactive npm browser authorization.
Its registry integrity matches the tested tarball, and the installed registry package
passed the ESM/CJS/CLI checks. This initial publication has no GitHub provenance attestation.

The GitHub trusted publisher is configured for subsequent releases:

| Field                | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| Provider             | GitHub Actions                                            |
| Organization or user | `Starfie1d1272`                                           |
| Repository           | `cs2-c4-damage`                                           |
| Workflow filename    | `publish.yml`                                             |
| Environment name     | `npm`                                                     |
| Allowed action       | Direct `npm publish` (npm also permits staged publishing) |

No `NPM_TOKEN` secret is needed. The workflow uses a GitHub-hosted runner, Node.js 24,
`id-token: write` and [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers).
The configured publisher is ready for the next version; a subsequent automated
publication will exercise the full OIDC path and record GitHub provenance. Do not rerun
publication of the existing beta version.

### Reconfiguring a publisher

An npm package owner can manage the binding in **Settings → Trusted Publisher** on
npmjs.com. With npm 11.15.0 or later, the equivalent command is:

```sh
npm trust github cs2-c4-damage \
  --repo Starfie1d1272/cs2-c4-damage \
  --file publish.yml --environment npm --allow-publish
```

This is a setup command, not part of normal releases. npm requests browser/2FA approval
for trust changes. Account-level 2FA is required. The package must already exist; for a
new package, an initial `npm login` and authenticated `npm publish` establish ownership.
A normal release uses the existing trusted publisher without repeating those steps.

## Prepare a version

1. Update `package.json` and `CHANGELOG.md`. Keep both READMEs aligned.
2. Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm build` and `pnpm test:package`.
3. Review package contents, license attribution and the complete diff. `test:package`
   checks the tarball and exercises its installed ESM/CJS entries and CLI with synthetic data.
4. Merge the release changes after CI passes.
5. Tag that commit, for example `v0.1.0-beta.1`, and push the tag.
6. Create a GitHub **prerelease** for a beta version. Use a normal release for a stable
   version. Publishing the release triggers `publish.yml`.

The workflow requires the tag to equal `v` + `package.json.version` and checks the
GitHub prerelease flag. Beta versions go to `beta`, stable versions to `latest`.
It verifies the same tarball that it publishes. Release builds do not use dependency caches.

## Retry and verify

If the first run stops for missing authorization, configure npm access, then use
**Actions → Publish npm → Run workflow**, entering the existing tag. This avoids editing
or recreating the release. Only retry when that npm version has not been published;
npm versions are immutable.

After success:

```sh
npm view cs2-c4-damage@0.1.0-beta.1 version dist-tags dist.integrity --json
npm install cs2-c4-damage@beta
```

Check the workflow logs and npm package provenance, then update the changelog's publication
status in the next maintenance commit. A published GitHub release and a published npm
version are separate states; the Actions run records whether npm publication succeeded.

## Package contents

The allowlist includes compiled exports/declarations, README translations, changelog,
license and credits. Research documents, development fixtures, game assets and telemetry
stay outside the tarball. Library SemVer, model revision and source-build identity are
maintained independently.
