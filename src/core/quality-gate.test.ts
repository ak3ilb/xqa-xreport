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

  it('mutes via titleContains match field', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-ki-'));
    const ki = path.join(dir, 'known-issues.json');
    fs.writeFileSync(
      ki,
      JSON.stringify({
        version: 1,
        issues: [{ id: 'KI-TITLE', mute: true, match: { titleContains: 'fails' } }],
      }),
      'utf8',
    );
    const run = applyKnownIssues(baseRun(), ki);
    assert.strictEqual(run.suites[0].tests[0].muted, true);
    assert.strictEqual(run.suites[0].tests[0].knownIssueId, 'KI-TITLE');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applyKnownIssues tolerates suites without nested suites array', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-ki-'));
    const ki = path.join(dir, 'known-issues.json');
    fs.writeFileSync(
      ki,
      JSON.stringify({
        version: 1,
        issues: [{ id: 'KI-2', mute: true, match: { titleContains: 'fails' } }],
      }),
      'utf8',
    );
    const run = baseRun();
    delete (run.suites[0] as { suites?: unknown }).suites;
    const out = applyKnownIssues(run, ki);
    assert.strictEqual(out.suites[0].tests[0].muted, true);
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

  it('finance-pr preset requires change ticket', () => {
    const run = baseRun();
    run.suites[0].tests[0].status = 'passed';
    run.summary = { ...run.summary, failed: 0, passed: 1 };
    const gate = evaluateQualityGate(run, { preset: 'finance-pr' });
    assert.strictEqual(gate.ok, false);
    assert.ok(gate.violations.some((v) => v.includes('changeTicket')));
    run.environment = { changeTicket: 'CHG-100' };
    const ok = evaluateQualityGate(run, { preset: 'finance-pr' });
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.counts.criticalFailed, 0);
  });

  it('fails on critical risk failures', () => {
    const run = baseRun();
    run.suites[0].tests[0].riskTier = 'critical';
    const gate = evaluateQualityGate(run, { maxCriticalFailed: 0 });
    assert.strictEqual(gate.ok, false);
    assert.ok(gate.violations.some((v) => v.includes('criticalFailed')));
  });
});
