import assert from 'node:assert/strict';
import process from 'node:process';
import { log } from 'node:console';
import { URL } from 'node:url';
import { appendFile, readFile } from 'node:fs/promises';

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const tag = process.env.RELEASE_TAG;
assert.equal(pkg.name, 'cs2-c4-damage');
assert.notEqual(pkg.private, true, 'package is private');
assert.match(
  pkg.version,
  /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/,
  'use a stable or beta version',
);
assert.equal(tag, `v${pkg.version}`, 'release tag must match package.json');
const beta = pkg.version.includes('-beta.');
const releasePrerelease = process.env.RELEASE_PRERELEASE;
if (releasePrerelease) {
  assert.equal(
    releasePrerelease,
    String(beta),
    'GitHub prerelease flag must match the version',
  );
}
const metadata = {
  dist_tag: beta ? 'beta' : 'latest',
  package_file: `${pkg.name}-${pkg.version}.tgz`,
};
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(metadata)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
}
log(JSON.stringify({ version: pkg.version, tag, ...metadata }));
