import assert from 'assert';
import { describe, it } from 'node:test';
import { collectTests, mapSuites, mergeOptions } from './utils';
import type { XReportSuite, XReportTest } from './types';

function t(id: string, status: XReportTest['status'] = 'passed'): XReportTest {
  return {
    id,
    historyId: `h-${id}`,
    title: id,
    fullTitle: `Suite › ${id}`,
    status,
    flaky: false,
    duration: 1,
    tags: [],
    annotations: [],
    errors: [],
    attempts: [],
    attachments: [],
    steps: [],
  };
}

describe('utils resilience', () => {
  it('mergeOptions defaults saveFullResults when history is on', () => {
    assert.strictEqual(mergeOptions({ enableHistory: true }).historyOptions.saveFullResults, true);
    assert.strictEqual(mergeOptions({ enableHistory: false }).historyOptions.saveFullResults, false);
    assert.strictEqual(
      mergeOptions({ enableHistory: true, historyOptions: { saveFullResults: false } }).historyOptions
        .saveFullResults,
      false,
    );
  });

  it('collectTests tolerates missing nested suites/tests arrays', () => {
    const suites = [{ title: 'S', file: 'a.ts', tests: [t('a')] }] as XReportSuite[];
    assert.strictEqual(collectTests(suites).length, 1);
    assert.strictEqual(collectTests(undefined as unknown as XReportSuite[]).length, 0);
    assert.strictEqual(
      collectTests([{ title: 'empty', file: 'b.ts' } as XReportSuite]).length,
      0,
    );
  });

  it('mapSuites tolerates undefined suites', () => {
    const out = mapSuites(undefined, (x) => ({ ...x, title: 'x' }));
    assert.deepStrictEqual(out, []);
  });
});
