/** Stage comparison is separate from final/native parity qualification. No tolerance. */
export interface StageComparison {
  readonly status: 'matched' | 'mismatch' | 'incomplete';
  readonly compared: number;
  readonly issues: readonly {
    readonly path: string;
    readonly reason: 'missing-or-invalid' | 'different';
    readonly expected?: unknown;
    readonly actual?: unknown;
  }[];
}
export function compareSamplingTraces(
  expected: unknown,
  actual: unknown,
): StageComparison {
  const issues: {
    path: string;
    reason: 'missing-or-invalid' | 'different';
    expected?: unknown;
    actual?: unknown;
  }[] = [];
  const get = (value: unknown, path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (v, k) =>
          v && typeof v === 'object'
            ? (v as Record<string, unknown>)[k]
            : undefined,
        value,
      );
  let compared = 0;
  function check(path: string, valid: (v: unknown) => boolean): void {
    const e = get(expected, path),
      a = get(actual, path);
    if (!valid(e) || !valid(a))
      issues.push({ path, reason: 'missing-or-invalid' });
    else {
      compared++;
      if (e !== a)
        issues.push({ path, reason: 'different', expected: e, actual: a });
    }
  }
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const damage = (v: unknown) =>
    number(v) && Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 255;
  const vector = (path: string) => {
    for (const axis of ['x', 'y', 'z']) check(`${path}.${axis}`, number);
  };
  function field(path: string): void {
    check(`${path}.valid`, (v) => typeof v === 'boolean');
    if (
      get(expected, `${path}.valid`) === true ||
      get(actual, `${path}.valid`) === true
    ) {
      check(`${path}.damage`, damage);
      vector(`${path}.blastDirection`);
      vector(`${path}.nodePosition`);
    }
  }
  vector('firstSamplePosition');
  field('firstField');
  if (
    get(expected, 'firstField.valid') === true ||
    get(actual, 'firstField.valid') === true
  ) {
    check('resampling.kind', (v) => v === 'skip' || v === 'ground-hit');
    if (
      get(expected, 'resampling.kind') === 'ground-hit' ||
      get(actual, 'resampling.kind') === 'ground-hit'
    ) {
      check('resampling.groundZ', number);
      vector('secondSamplePosition');
      field('secondField');
    } else {
      check('resampling.reason', (v) => typeof v === 'string' && v.length > 0);
      if (
        get(expected, 'secondField') !== undefined ||
        get(actual, 'secondField') !== undefined
      )
        issues.push({ path: 'secondField', reason: 'missing-or-invalid' });
    }
    check('selectedStage', (v) => v === 'first' || v === 'second');
    check('damage', damage);
    for (const [side, value] of [
      ['expected', expected],
      ['actual', actual],
    ] as const) {
      const second = get(value, 'secondField.valid');
      const selected = second === true ? 'second' : 'first';
      if (get(value, 'selectedStage') !== selected)
        issues.push({
          path: `${side}.selectedStage`,
          reason: 'missing-or-invalid',
        });
    }
  }
  if (
    get(expected, 'firstField.valid') === false &&
    get(actual, 'firstField.valid') === false
  ) {
    for (const path of [
      'secondSamplePosition',
      'secondField',
      'selectedStage',
      'damage',
    ])
      if (get(expected, path) !== undefined || get(actual, path) !== undefined)
        issues.push({ path, reason: 'missing-or-invalid' });
  }
  return {
    status: issues.some((i) => i.reason === 'different')
      ? 'mismatch'
      : issues.length
        ? 'incomplete'
        : 'matched',
    compared,
    issues,
  };
}
