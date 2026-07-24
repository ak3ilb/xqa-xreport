import assert from 'assert';
import { describe, it } from 'node:test';
import {
  failurePatternsFromHistory,
  flakeStatsFromHistory,
  flakinessTrendForTest,
  slowestFromHistory,
} from './analytics';
import type { HistoryRecord } from './types';

function rec(partial: Partial<HistoryRecord> & { id: string; date: number }): HistoryRecord {
  return {
    framework: 'playwright',
    title: 't',
    summary: {
      total: 1,
      passed: 0,
      failed: 1,
      flaky: 0,
      skipped: 0,
      timedOut: 0,
      pending: 0,
      duration: 100,
    },
    failedIds: [],
    passedIds: [],
    ...partial,
  };
}

describe('history analytics helpers', () => {
  it('ranks flakes and trends', () => {
    const records = [
      rec({
        id: '1',
        date: Date.now(),
        tests: [
          { historyId: 'h1', title: 'a', status: 'failed', duration: 100, project: 'chromium' },
          { historyId: 'h2', title: 'b', status: 'passed', duration: 900, project: 'chromium' },
        ],
        environment: { branch: 'main', ci: true },
      }),
      rec({
        id: '2',
        date: Date.now() - 1000,
        tests: [
          { historyId: 'h1', title: 'a', status: 'passed', duration: 80, project: 'chromium' },
          { historyId: 'h2', title: 'b', status: 'passed', duration: 800, project: 'chromium' },
        ],
        environment: { branch: 'main', ci: true },
      }),
    ];
    const flakes = flakeStatsFromHistory(records);
    assert.ok(flakes.some((f) => f.historyId === 'h1'));
    const trend = flakinessTrendForTest(records, 'h1', 30);
    assert.ok(trend.length >= 2);
    const slow = slowestFromHistory(records, 5);
    assert.ok(slow[0].historyId === 'h2');
    const patterns = failurePatternsFromHistory(records);
    assert.ok(patterns.some((p) => p.fails >= 1));
  });
});
