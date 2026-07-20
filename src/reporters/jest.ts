import * as path from 'path';
import {
  clearKeyedContext,
  takeAttachmentsFor,
  takeMetaFor,
  takeStepsFor,
} from '../context';
import { createMediaStore, storeAttachment } from '../core/media';
import type { TestStatus, XReportOptions, XReportSuite, XReportTest } from '../core/types';
import {
  buildRun,
  createId,
  historyId,
  isFlaky,
  mergeOptions,
} from '../core/utils';
import { generateReport } from '../generator';

/** Minimal Jest types — no hard dependency on @jest/reporters */
type JestAssertionResult = {
  title: string;
  fullName?: string;
  status: string;
  duration?: number | null;
  failureMessages?: string[];
  ancestorTitles?: string[];
  location?: { line?: number; column?: number } | null;
  numPassingAsserts?: number;
};

type JestTestResult = {
  testFilePath: string;
  testResults: JestAssertionResult[];
  console?: Array<{ type?: string; message?: string }>;
};

type JestAggregatedResult = {
  testResults: JestTestResult[];
  startTime?: number;
};

function mapStatus(status?: string): TestStatus {
  const s = (status || '').toLowerCase();
  if (s === 'passed') return 'passed';
  if (s === 'failed') return 'failed';
  if (s === 'pending' || s === 'todo') return 'pending';
  if (s === 'skipped' || s === 'disabled') return 'skipped';
  return 'skipped';
}

function ensureSuitePath(root: XReportSuite, parts: string[], file?: string): XReportSuite {
  let node = root;
  for (const title of parts) {
    let child = node.suites.find((s) => s.title === title);
    if (!child) {
      child = { id: createId('suite'), title, file, suites: [], tests: [] };
      node.suites.push(child);
    }
    node = child;
  }
  return node;
}

/**
 * Jest custom reporter.
 *
 * In tests, attach context with:
 * ```js
 * const { attach } = require('@xqa.io/xreport/context');
 * attach.note({ type: 'json', title: 'payload', value: { ok: true } });
 * attach.meta({ owner: 'platform', severity: 'high' });
 * ```
 */
export default class XReportJestReporter {
  private options: ReturnType<typeof mergeOptions>;
  private startedAt = Date.now();

  constructor(_globalConfig: unknown, options: XReportOptions = {}) {
    this.options = mergeOptions(options || {});
  }

  onRunStart(): void {
    this.startedAt = Date.now();
  }

  onRunComplete(_contexts: unknown, results: JestAggregatedResult): void | Promise<void> {
    const finishedAt = Date.now();
    const media = createMediaStore(path.resolve(this.options.reportDir));
    const root: XReportSuite = {
      id: createId('suite'),
      title: 'Root',
      suites: [],
      tests: [],
    };

    for (const fileResult of results.testResults || []) {
      const file = fileResult.testFilePath
        ? path.relative(process.cwd(), fileResult.testFilePath)
        : undefined;
      const fileLogs = (fileResult.console || [])
        .map((c) => ({
          type: (c.type === 'error' ? 'stderr' : 'console') as 'stderr' | 'console',
          text: c.message || '',
        }))
        .filter((l) => l.text);

      for (const tr of fileResult.testResults || []) {
        const status = mapStatus(tr.status);
        const ancestors = tr.ancestorTitles || [];
        const parent = ensureSuitePath(root, ancestors, file);
        const dotted = [...ancestors, tr.title].join(' ');
        const fullTitle = [...ancestors, tr.title].join(' › ') || tr.fullName || tr.title;
        const duration = typeof tr.duration === 'number' ? tr.duration : 0;
        const errors = (tr.failureMessages || []).map((msg) => {
          const lines = String(msg).split('\n');
          return { message: lines[0] || String(msg), stack: msg };
        });
        const attempts: XReportTest['attempts'] = [{ status, duration, errors }];
        const tags = (tr.title.match(/@[\w-]+/g) || []) as string[];
        const ctxAtts = takeAttachmentsFor(tr.fullName, fullTitle, dotted, tr.title);
        const attachments = ctxAtts.map((a) =>
          storeAttachment(media, {
            name: a.name,
            type: a.type,
            source: a.path,
            body: a.body,
            contentType: a.contentType,
          }),
        );
        const meta = takeMetaFor(tr.fullName, fullTitle, dotted, tr.title);
        const steps = takeStepsFor(tr.fullName, fullTitle, dotted, tr.title);
        const labels = { ...(meta?.labels || {}) };
        if (typeof tr.numPassingAsserts === 'number') {
          labels.assertions = String(tr.numPassingAsserts);
        }
        const test: XReportTest = {
          id: createId('test'),
          historyId: historyId(fullTitle, file),
          title: tr.title,
          fullTitle,
          status,
          flaky: isFlaky(attempts, status),
          duration,
          file,
          line: tr.location?.line,
          tags,
          attempts,
          steps,
          errors,
          attachments,
          annotations: [
            ...(meta?.owner ? [{ type: 'owner', description: meta.owner }] : []),
            ...(meta?.severity ? [{ type: 'severity', description: meta.severity }] : []),
            ...Object.entries(labels).map(([type, description]) => ({ type, description })),
          ],
          owner: meta?.owner,
          severity: meta?.severity,
          labels,
          logs: fileLogs.length ? fileLogs : undefined,
          retries: 0,
          startTime: finishedAt - duration,
        };
        parent.tests.push(test);
      }
    }

    const run = buildRun({
      title: this.options.reportTitle,
      framework: 'jest',
      startedAt: results.startTime || this.startedAt,
      finishedAt,
      suites: root.suites.length ? root.suites : [root],
      options: this.options,
    });
    return generateReport(run, this.options).then(() => clearKeyedContext());
  }
}

module.exports = XReportJestReporter;
