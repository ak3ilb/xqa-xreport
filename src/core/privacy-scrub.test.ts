import assert from 'assert';
import { describe, it } from 'node:test';
import { applyPrivacyScrub } from './privacy-scrub';
import type { XReportRun } from './types';

describe('privacy-scrub', () => {
  it('redacts SSN and email in errors', () => {
    const run = {
      version: '0.6.0',
      generator: 'test',
      title: 'p',
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
              errors: [
                {
                  message: 'Patient SSN 123-45-6789 email jane.doe@hospital.org',
                },
              ],
              attempts: [],
              attachments: [{ id: 'a', name: 'mrn-99999.png', type: 'screenshot' }],
              steps: [],
            },
          ],
        },
      ],
    } as XReportRun;

    const scrubbed = applyPrivacyScrub(run, { scrubAttachments: true });
    const msg = scrubbed.suites[0].tests[0].errors[0].message;
    assert.ok(msg.includes('[REDACTED]'));
    assert.ok(!msg.includes('123-45-6789'));
    assert.ok(!msg.includes('jane.doe@hospital.org'));
    assert.strictEqual(scrubbed.environment?.privacyMode, 'scrubbed');
  });
});
