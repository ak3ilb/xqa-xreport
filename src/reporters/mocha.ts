import * as path from 'path';
import { takeAttachments } from '../context';
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

type MochaRunner = {
  on(event: string, fn: (...args: any[]) => void): void;
};

function mapState(state?: string, pending?: boolean): TestStatus {
  if (pending || state === 'pending') return 'pending';
  if (state === 'passed') return 'passed';
  if (state === 'failed') return 'failed';
  return 'skipped';
}

class XReportMochaReporter {
  constructor(runner: MochaRunner, options: { reporterOptions?: XReportOptions } | XReportOptions = {}) {
    const raw =
      (options as { reporterOptions?: XReportOptions }).reporterOptions ||
      (options as XReportOptions);
    const opts = mergeOptions(raw);
    const startedAt = Date.now();
    const suiteStack: XReportSuite[] = [];
    const root: XReportSuite = {
      id: createId('suite'),
      title: 'Root',
      suites: [],
      tests: [],
    };
    suiteStack.push(root);
    const media = createMediaStore(path.resolve(opts.reportDir));
    const attemptMap = new Map<string, XReportTest['attempts']>();

    runner.on('suite', (suite: any) => {
      if (!suite.title) return;
      const node: XReportSuite = {
        id: createId('suite'),
        title: suite.title,
        file: suite.file,
        suites: [],
        tests: [],
      };
      suiteStack[suiteStack.length - 1].suites.push(node);
      suiteStack.push(node);
    });

    runner.on('suite end', (suite: any) => {
      if (!suite.title) return;
      suiteStack.pop();
    });

    runner.on('test end', (test: any) => {
      const parent = suiteStack[suiteStack.length - 1];
      const status = mapState(test.state, test.pending);
      const key = `${test.file || ''}::${test.fullTitle()}`;
      const attempts = attemptMap.get(key) || [];
      attempts.push({
        status,
        duration: test.duration || 0,
        errors: test.err
          ? [{ message: test.err.message || String(test.err), stack: test.err.stack }]
          : [],
      });
      attemptMap.set(key, attempts);

      const existing = parent.tests.find((t) => t.fullTitle === test.fullTitle());
      const ctx = takeAttachments(test).map((a) =>
        storeAttachment(media, {
          name: a.name,
          type: a.type,
          source: a.path,
          body: a.body,
          contentType: a.contentType,
        }),
      );

      const flaky = isFlaky(attempts, status);
      const tags: string[] = Array.isArray(test.tags)
        ? test.tags
        : typeof test.title === 'string'
          ? (test.title.match(/@[\w-]+/g) || [])
          : [];
      const stdout =
        typeof test.stdout === 'string'
          ? test.stdout
          : Array.isArray(test.stdout)
            ? test.stdout.map((c: any) => (typeof c === 'string' ? c : c?.toString?.() || '')).join('')
            : undefined;
      const stderr =
        typeof test.stderr === 'string'
          ? test.stderr
          : Array.isArray(test.stderr)
            ? test.stderr.map((c: any) => (typeof c === 'string' ? c : c?.toString?.() || '')).join('')
            : undefined;
      const payload: XReportTest = {
        id: existing?.id || createId('test'),
        historyId: historyId(test.fullTitle(), test.file),
        title: test.title,
        fullTitle: test.fullTitle(),
        status,
        flaky,
        duration: attempts.reduce((n, a) => n + a.duration, 0),
        file: test.file,
        tags,
        attempts: [...attempts],
        steps: [],
        errors: test.err
          ? [{ message: test.err.message || String(test.err), stack: test.err.stack }]
          : [],
        attachments: [...(existing?.attachments || []), ...ctx],
        annotations: [],
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        logs:
          stdout || stderr
            ? [
                ...(stdout ? [{ type: 'stdout' as const, text: stdout }] : []),
                ...(stderr ? [{ type: 'stderr' as const, text: stderr }] : []),
              ]
            : undefined,
        retries: Math.max(0, attempts.length - 1),
        startTime: typeof test.startedAt === 'number' ? test.startedAt : Date.now() - (test.duration || 0),
      };

      if (existing) Object.assign(existing, payload);
      else parent.tests.push(payload);
    });

    runner.on('end', () => {
      const finishedAt = Date.now();
      const run = buildRun({
        title: opts.reportTitle,
        framework: 'mocha',
        startedAt,
        finishedAt,
        suites: root.suites.length ? root.suites : [root],
        options: opts,
      });
      void generateReport(run, opts);
    });
  }
}

module.exports = XReportMochaReporter;
export default XReportMochaReporter;
