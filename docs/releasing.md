# Releasing

The repository uses GitHub Actions for CI/CD. `ci.yml` tests Linux, Windows and macOS
on Node.js 22/24. `publish.yml` builds, checks and publishes a tagged version to npm.
The initial release version is `0.1.0-beta.1`, distributed under the npm `beta` tag.

## One-time npm setup

GitHub access and npm package ownership are separate. The publishing workflow supports
[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) with GitHub OIDC;
once configured, no long-lived npm token is needed.

For a package that has not yet been created on npm, first establish ownership with an
authenticated publish. Choose one bootstrap route:

1. **GitHub Actions:** create a short-lived granular npm token able to publish this new
   package (with bypass 2FA enabled for automated publishing), then add it as the
   `NPM_TOKEN` secret in the repository's `npm` environment or repository Actions secrets.
   Never commit or paste the token into issues, documentation or chat. Publish the GitHub
   prerelease as described below. Delete/revoke the bootstrap token after OIDC is configured.
2. **Local login:** on your own machine, check out the release tag, run the full checks,
   `npm login`, then `npm publish --access public --tag beta`. Complete npm's browser/2FA
   prompts. This establishes the first version without CI provenance; subsequent versions
   can use OIDC. Do not rerun the workflow for that already-published version.

After the package exists, open its npm **Settings → Trusted Publisher** and configure:

| Field                | Value                       |
| -------------------- | --------------------------- |
| Provider             | GitHub Actions              |
| Organization or user | `Starfie1d1272`             |
| Repository           | `cs2-c4-damage`             |
| Workflow filename    | `publish.yml`               |
| Environment name     | `npm`                       |
| Allowed action       | Enable direct `npm publish` |

The workflow uses a GitHub-hosted runner, Node.js 24 and `id-token: write`. npm requires
CLI 11.5.1+ for this flow; the Node.js 24 runner provides a compatible CLI. npm records
provenance for GitHub publications. Enabling GitHub environment reviewers is optional;
if configured, the maintainer approves the deployment in Actions.

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
