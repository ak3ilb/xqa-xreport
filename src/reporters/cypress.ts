import * as fs from 'fs';
import * as path from 'path';
import {
  attach,
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

type MochaRunner = {
  on(event: string, fn: (...args: any[]) => void): void;
};

function mapState(state?: string, pending?: boolean): TestStatus {
  if (pending || state === 'pending') return 'pending';
  if (state === 'passed') return 'passed';
  if (state === 'failed') return 'failed';
  return 'skipped';
}

function mapCyStatus(state?: string): TestStatus {
  const s = (state || '').toLowerCase();
  if (s === 'passed' || s === 'pass') return 'passed';
  if (s === 'failed' || s === 'fail') return 'failed';
  if (s === 'pending') return 'pending';
  if (s === 'skipped') return 'skipped';
  return 'skipped';
}

/**
 * Mocha-compatible reporter for `cypress.config` `reporter` option.
 * Prefer {@link setupXReport} for Cypress 10+ (`after:run` + screenshots/video/steps).
 */
class XReportCypressMochaReporter {
  constructor(runner: MochaRunner, options: { reporterOptions?: XReportOptions } | XReportOptions = {}) {
    const raw =
      (options as { reporterOptions?: XReportOptions }).reporterOptions ||
      (options as XReportOptions);
    const opts = mergeOptions({ ...raw, reportTitle: raw.reportTitle || 'Cypress · XREPORT' });
    const startedAt = Date.now();
    const suiteStack: XReportSuite[] = [];
    const root: XReportSuite = {
      id: createId('suite'),
      title: 'Root',
      suites: [],
      tests: [],
    };
    suiteStack.push(root);
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
      const fullTitle =
        typeof test.fullTitle === 'function' ? test.fullTitle() : test.title;
      const key = `${test.file || ''}::${fullTitle}`;
      const attempts = attemptMap.get(key) || [];
      attempts.push({
        status,
        duration: test.duration || 0,
        errors: test.err
          ? [{ message: test.err.message || String(test.err), stack: test.err.stack }]
          : [],
      });
      attemptMap.set(key, attempts);

      const existing = parent.tests.find((t) => t.fullTitle === fullTitle);
      const tags: string[] = (test.title || '').match(/@[\w-]+/g) || [];
      const payload: XReportTest = {
        id: existing?.id || createId('test'),
        historyId: historyId(fullTitle, test.file),
        title: test.title,
        fullTitle,
        status,
        flaky: isFlaky(attempts, status),
        duration: attempts.reduce((n, a) => n + a.duration, 0),
        file: test.file,
        tags,
        attempts: [...attempts],
        steps: takeStepsFor(fullTitle, test.title),
        errors: test.err
          ? [{ message: test.err.message || String(test.err), stack: test.err.stack }]
          : [],
        attachments: existing?.attachments || [],
        annotations: [],
        retries: Math.max(0, attempts.length - 1),
        startTime: Date.now() - (test.duration || 0),
      };
      if (existing) Object.assign(existing, payload);
      else parent.tests.push(payload);
    });

    runner.on('end', () => {
      const finishedAt = Date.now();
      const run = buildRun({
        title: opts.reportTitle,
        framework: 'cypress',
        startedAt,
        finishedAt,
        suites: root.suites.length ? root.suites : [root],
        options: opts,
      });
      void generateReport(run, opts).finally(() => clearKeyedContext());
    });
  }
}

/** Cypress `after:run` results (partial typing) */
type CypressRunResults = {
  totalDuration?: number;
  startedTestsAt?: string;
  endedTestsAt?: string;
  browserName?: string;
  runs?: Array<{
    spec?: { name?: string; relative?: string; absolute?: string };
    stats?: { wallClockDuration?: number };
    video?: string | null;
    tests?: Array<{
      title?: string | string[];
      state?: string;
      displayError?: string | null;
      duration?: number;
      attempts?: Array<{
        state?: string;
        duration?: number;
        error?: { message?: string; stack?: string } | null;
        videoTimestamp?: number;
      }>;
    }>;
    screenshots?: Array<{ path?: string; name?: string; takenAt?: string }>;
  }>;
};

function titleParts(title: string | string[] | undefined): string[] {
  if (Array.isArray(title)) return title.filter(Boolean);
  if (typeof title === 'string' && title) return [title];
  return ['(unnamed)'];
}

/**
 * Preferred Cypress 10+ integration via `setupNodeEvents`.
 *
 * Also register support:
 * ```ts
 * // cypress/support/e2e.ts
 * import { registerXReportCypress } from '@xqa.io/xreport/cypress/support';
 * registerXReportCypress();
 * ```
 */
export function setupXReport(
  on: (event: string, fn: any) => void,
  _config: unknown,
  options: XReportOptions = {},
): void {
  const opts = mergeOptions({
    ...options,
    reportTitle: options.reportTitle || 'Cypress · XREPORT',
  });

  on('task', {
    'xreport:attach'(payload: {
      key?: string;
      attachment?: { type?: string; title?: string; value?: unknown; path?: string };
    }) {
      const key = payload?.key;
      const a = payload?.attachment;
      if (!key || !a) return null;
      if (a.type === 'json') {
        attach.to(key, { type: 'json', title: a.title || 'json', value: a.value });
      } else if (a.path) {
        attach.to(key, {
          type: (a.type as any) || 'file',
          title: a.title || 'file',
          path: a.path,
        });
      } else {
        attach.to(key, {
          type: 'text',
          title: a.title || 'note',
          value: typeof a.value === 'string' ? a.value : JSON.stringify(a.value),
        });
      }
      return null;
    },
    'xreport:steps'(payload: { key?: string; steps?: any[] }) {
      if (payload?.key && Array.isArray(payload.steps)) {
        attach.steps(
          payload.key,
          payload.steps.map((s) => ({
            title: String(s.title || s.name || 'step'),
            status: (s.status === 'failed'
              ? 'failed'
              : s.status === 'skipped'
                ? 'skipped'
                : 'passed') as TestStatus,
            duration: Number(s.duration) || 0,
            category: s.category || 'cy:command',
          })),
        );
      }
      return null;
    },
    'xreport:meta'(payload: {
      key?: string;
      meta?: { owner?: string; severity?: string; labels?: Record<string, string> };
    }) {
      if (payload?.key && payload.meta) attach.meta(payload.key, payload.meta);
      return null;
    },
  });

  on('after:run', async (results: CypressRunResults) => {
    const startedAt = results.startedTestsAt
      ? Date.parse(results.startedTestsAt)
      : Date.now() - (results.totalDuration || 0);
    const finishedAt = results.endedTestsAt ? Date.parse(results.endedTestsAt) : Date.now();
    const media = createMediaStore(path.resolve(opts.reportDir));
    const root: XReportSuite = {
      id: createId('suite'),
      title: 'Root',
      suites: [],
      tests: [],
    };

    for (const run of results.runs || []) {
      const file = run.spec?.relative || run.spec?.name;
      const suite: XReportSuite = {
        id: createId('suite'),
        title: file || run.spec?.name || 'spec',
        file,
        suites: [],
        tests: [],
      };
      root.suites.push(suite);

      const specShots = (run.screenshots || []).filter(
        (s) => s.path && fs.existsSync(s.path),
      );
      const videoPath = run.video && fs.existsSync(run.video) ? run.video : undefined;

      for (const t of run.tests || []) {
        const parts = titleParts(t.title);
        const title = parts[parts.length - 1];
        const fullTitle = parts.join(' › ');
        const attemptsRaw = t.attempts?.length
          ? t.attempts
          : [
              {
                state: t.state,
                duration: t.duration,
                error: t.displayError ? { message: t.displayError } : null,
              },
            ];
        const attempts: XReportTest['attempts'] = attemptsRaw.map((a) => ({
          status: mapCyStatus(a.state),
          duration: a.duration || 0,
          errors: a.error
            ? [{ message: a.error.message || String(a.error), stack: a.error.stack }]
            : [],
        }));
        const status = mapCyStatus(t.state) || attempts[attempts.length - 1]?.status || 'skipped';
        const errors =
          attempts.length && attempts[attempts.length - 1].errors.length
            ? attempts[attempts.length - 1].errors
            : t.displayError
              ? [{ message: t.displayError }]
              : [];

        const matched = specShots.filter(
          (s) =>
            (s.name || '').includes(title) ||
            (s.path || '').includes(title.replace(/\s+/g, '_')),
        );
        const shotSources =
          matched.length > 0 ? matched : status === 'failed' ? specShots.slice(0, 2) : [];
        const atts = shotSources.map((s) =>
          storeAttachment(media, {
            name: path.basename(s.path!),
            type: 'screenshot',
            source: s.path!,
            contentType: 'image/png',
          }),
        );
        if (videoPath && status === 'failed') {
          atts.push(
            storeAttachment(media, {
              name: path.basename(videoPath),
              type: 'video',
              source: videoPath,
              contentType: 'video/mp4',
            }),
          );
        }

        const ctxAtts = takeAttachmentsFor(fullTitle, title, parts.join(' '));
        for (const a of ctxAtts) {
          atts.push(
            storeAttachment(media, {
              name: a.name,
              type: a.type,
              source: a.path,
              body: a.body,
              contentType: a.contentType,
            }),
          );
        }

        const steps = takeStepsFor(fullTitle, title, parts.join(' '));
        const meta = takeMetaFor(fullTitle, title, parts.join(' '));
        const tags = (title.match(/@[\w-]+/g) || []) as string[];
        const test: XReportTest = {
          id: createId('test'),
          historyId: historyId(fullTitle, file),
          title,
          fullTitle,
          status,
          flaky: isFlaky(attempts, status),
          duration: attempts.reduce((n, a) => n + a.duration, 0) || t.duration || 0,
          file,
          project: results.browserName,
          tags,
          attempts,
          steps,
          errors,
          attachments: atts,
          annotations: [
            ...(meta?.owner ? [{ type: 'owner', description: meta.owner }] : []),
            ...(meta?.severity ? [{ type: 'severity', description: meta.severity }] : []),
            ...Object.entries(meta?.labels || {}).map(([type, description]) => ({
              type,
              description,
            })),
          ],
          owner: meta?.owner,
          severity: meta?.severity,
          labels: meta?.labels || {},
          retries: Math.max(0, attempts.length - 1),
          startTime: finishedAt - (t.duration || 0),
        };
        suite.tests.push(test);
      }
    }

    const xrun = buildRun({
      title: opts.reportTitle,
      framework: 'cypress',
      startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      finishedAt: Number.isFinite(finishedAt) ? finishedAt : Date.now(),
      suites: root.suites.length ? root.suites : [root],
      options: opts,
      environment: {
        browser: results.browserName || 'cypress',
        ci: !!process.env.CI,
      },
    });
    await generateReport(xrun, opts);
    clearKeyedContext();
  });
}

export default XReportCypressMochaReporter;
module.exports = XReportCypressMochaReporter;
module.exports.default = XReportCypressMochaReporter;
module.exports.setupXReport = setupXReport;
