import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import { buildAiContextPack, writeAiContextPack } from './ai-context';
import type { XReportRun } from './types';

function sampleRun(): XReportRun {
  return {
    version: '0.5.0',
    generator: '@xqa.io/xreport@0.5.0',
    title: 'Sample',
    framework: 'playwright',
    startedAt: 1,
    finishedAt: 2,
    duration: 1,
    options: {},
    brand: { name: 'XQA', website: 'https://xqa.io' },
    branding: { projectName: 'XREPORT', companyName: 'XQA', accentColor: '#0071E3', website: 'https://xqa.io' },
    environment: { branch: 'main' },
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
        id: 's1',
        title: 'suite',
        file: 'a.spec.ts',
        tests: [
          {
            id: 't1',
            historyId: 'h1',
            title: 'fails',
            fullTitle: 'suite fails',
            status: 'failed',
            flaky: false,
            duration: 10,
            retries: 0,
            file: 'a.spec.ts',
            line: 10,
            tags: [],
            annotations: [],
            errors: [{ message: 'Expected true to be false', stack: 'Error\n    at a.spec.ts:10:1' }],
            attempts: [
              {
                status: 'failed',
                duration: 10,
                errors: [{ message: 'Expected true to be false', stack: 'Error\n    at a.spec.ts:10:1' }],
              },
            ],
            attachments: [],
            steps: [],
            failureCategory: 'assertion',
            defectKind: 'product',
            clusterId: 'c1',
            errorSignature: 'expected true to be false',
          },
        ],
        suites: [],
      },
    ],
    analytics: {
      slowest: [],
      byFile: [],
      tagHealth: [],
      clusters: [
        {
          id: 'c1',
          signature: 'expected true to be false',
          count: 1,
          sample: 'Expected true to be false',
          category: 'assertion',
          testIds: ['t1'],
        },
      ],
      regressions: [],
      byProject: [],
      stabilityGrade: 'C',
      stabilityScore: 70,
      historyTrend: [],
      byCategory: [],
      quarantine: [],
      byEnvironment: [],
      historyRuns: [],
    },
  };
}

describe('buildAiContextPack', () => {
  it('has stable shape with agentPrompt and clusters', () => {
    const pack = buildAiContextPack(sampleRun());
    assert.strictEqual(pack.version, 1);
    assert.ok(pack.generatedAt);
    assert.strictEqual(pack.run.title, 'Sample');
    assert.strictEqual(pack.clusters.length, 1);
    assert.strictEqual(pack.failures.length, 1);
    assert.ok(pack.agentPrompt.includes('Top failure clusters'));
    assert.ok(pack.agentPrompt.includes('suite fails'));
  });
});

describe('writeAiContextPack', () => {
  it('writes ai-context.json and ai-context.md', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-ai-'));
    const { jsonPath, mdPath, pack } = writeAiContextPack(dir, sampleRun());
    assert.ok(fs.existsSync(jsonPath));
    assert.ok(fs.existsSync(mdPath));
    const loaded = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.strictEqual(loaded.version, 1);
    assert.strictEqual(pack.clusters[0].id, 'c1');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
