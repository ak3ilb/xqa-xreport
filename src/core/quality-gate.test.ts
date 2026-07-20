import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import { applyKnownIssues } from './known-issues';
import { evaluateQualityGate } from './quality-gate';
import type { XReportRun } from './types';

function baseRun(overrides: Partial<XReportRun> = {}): XReportRun {
  return {
    version: '0.5.2',
    generator: 'test',
    title: 'gate',
    framework: 'playwright',
    startedAt: 1,
    finishedAt: 2,
    duration: 1,
    options: {},
    brand: { name: 'XQA', website: 'https://xqa.io' },
    branding: {
      projectName: 'XREPORT',
      companyName: 'XQA',
      accentColor: '#0071E3',
      website: 'https://xqa.io',
    },
    environment: {},
    summary: {
      total: 1,
      passed: 0,
      failed: 1,
      flaky: 0,
      skipped: 0,
      timedOut: 0,
      pending: 0,
      duration: 1,
    },
    suites: [
      {
        id: 's',
        title: 's',
        suites: [],
        tests: [
          {
            id: 't1',
            historyId: 'h1',
            title: 'fails',
            fullTitle: 's fails',
            status: 'failed',
            flaky: false,
            duration: 10,
            tags: [],
            annotations: [],
            errors: [{ message: 'Timeout waiting for locator' }],
            attempts: [
              {
                status: 'failed',
                duration: 10,
                errors: [{ message: 'Timeout waiting for locator' }],
              },
            ],
            attachments: [],
            steps: [],
            failureCategory: 'timing',
            defectKind: 'automation',
            clusterId: 'abc123',
            errorSignature: 'timeout waiting for locator',
            regression: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('known-issues + quality-gate', () => {
  it('mutes matching failures and passes gate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-ki-'));
    const ki = path.join(dir, 'known-issues.json');
    fs.writeFileSync(
      ki,
      JSON.stringify({
        version: 1,
        issues: [
          {
            id: 'KI-1',
            mute: true,
            reason: 'known',
            match: { signatureContains: 'timeout waiting' },
          },
        ],
      }),
      'utf8',
    );
    const run = applyKnownIssues(baseRun(), ki);
    const t = run.suites[0].tests[0];
    assert.strictEqual(t.muted, true);
    assert.strictEqual(t.knownIssueId, 'KI-1');
    const gate = evaluateQualityGate(run, { maxFailed: 0, maxNewFailures: 0 });
    assert.strictEqual(gate.ok, true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails gate on product defects', () => {
    const run = baseRun();
    run.suites[0].tests[0].defectKind = 'product';
    run.suites[0].tests[0].errors = [{ message: 'Expected 1 to be 2' }];
    const gate = evaluateQualityGate(run, { maxProductDefects: 0 });
    assert.strictEqual(gate.ok, false);
    assert.ok(gate.violations.some((v) => v.includes('productDefects')));
  });
});
