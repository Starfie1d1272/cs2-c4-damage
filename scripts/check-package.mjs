import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { outcomeFromDamageRange } from 'cs2-c4-damage';
import { assessGsiSnapshot } from 'cs2-c4-damage/gsi';
const require = createRequire(import.meta.url);
for (const core of [{ outcomeFromDamageRange }, require('cs2-c4-damage')]) {
  assert.equal(
    core.outcomeFromDamageRange(50, { min: 40, max: 60 }, ['ducked']).lethal,
    'indeterminate',
  );
}
for (const gsi of [{ assessGsiSnapshot }, require('cs2-c4-damage/gsi')]) {
  assert.equal(gsi.assessGsiSnapshot({}).ducked, undefined);
}
