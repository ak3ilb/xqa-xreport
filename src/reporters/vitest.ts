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

/** Minimal Vitest task shapes — no hard dependency on vitest */
type VitestTask = {
  type?: string;
  name?: string;
  mode?: string;
  meta?: Record<string, unknown>;
  result?: {
    state?: string;
    duration?: number;
    errors?: Array<{ message?: string; stack?: string; name?: string }>;
    retryCount?: number;
  };
  location?: { line?: number; column?: number };
  filepath?: string;
  tasks?: VitestTask[];
};

type VitestFile = VitestTask & {
  filepath?: string;
  name?: string;
};

function mapState(state?: string, mode?: string): TestStatus {
  const s = (state || '').toLowerCase();
  if (mode === 'skip' || s === 'skip' || s === 'skipped') return 'skipped';
  if (mode === 'todo' || s === 'todo') return 'pending';
  if (s === 'pass' || s === 'passed') return 'passed';
  if (s === 'fail' || s === 'failed') return 'failed';
  return 'skipped';
}

function ensureSuite(parent: XReportSuite, title: string, file?: string): XReportSuite {
  let child = parent.suites.find((s) => s.title === title);
  if (!child) {
    child = { id: createId('suite'), title, file, suites: [], tests: [] };
    parent.suites.push(child);
  }
  return child;
}

function walkTasks(
  tasks: VitestTask[] | undefined,
  parent: XReportSuite,
  file: string | undefined,
  ancestors: string[],
  media: ReturnType<typeof createMediaStore>,
): void {
  for (const task of tasks || []) {
    const name = task.name || '(unnamed)';
    if (task.type === 'suite' || (task.tasks && task.tasks.length && task.type !== 'test')) {
      const suite = ensureSuite(parent, name, file);
      walkTasks(task.tasks, suite, file, [...ancestors, name], media);
      continue;
    }
    const status = mapState(task.result?.state, task.mode);
    const duration = task.result?.duration || 0;
    const fullTitle = [...ancestors, name].join(' › ');
    const dotted = [...ancestors, name].join(' ');
    const errors = (task.result?.errors || []).map((e) => ({
      message: e.message || e.name || 'Error',
      stack: e.stack,
    }));
    const attempts: XReportTest['attempts'] = [{ status, duration, errors }];
    const tags = (name.match(/@[\w-]+/g) || []) as string[];
    const ctxAtts = takeAttachmentsFor(fullTitle, dotted, name);
    const attachments = ctxAtts.map((a) =>
      storeAttachment(media, {
        name: a.name,
        type: a.type,
        source: a.path,
        body: a.body,
        contentType: a.contentType,
      }),
    );
    const keyedMeta = takeMetaFor(fullTitle, dotted, name);
    const fromTaskMeta = task.meta || {};
    const owner =
      keyedMeta?.owner ||
      (typeof fromTaskMeta.owner === 'string' ? fromTaskMeta.owner : undefined);
    const severity =
      keyedMeta?.severity ||
      (typeof fromTaskMeta.severity === 'string' ? fromTaskMeta.severity : undefined);
    const labels: Record<string, string> = { ...(keyedMeta?.labels || {}) };
    for (const [k, v] of Object.entries(fromTaskMeta)) {
      if (k === 'owner' || k === 'severity') continue;
      if (v == null) continue;
      labels[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    const steps = takeStepsFor(fullTitle, dotted, name);
    const retries = task.result?.retryCount || 0;
    const test: XReportTest = {
      id: createId('test'),
      historyId: historyId(fullTitle, file),
      title: name,
      fullTitle,
      status,
      flaky: isFlaky(attempts, status) || retries > 0,
      duration,
      file,
      line: task.location?.line,
      tags,
      attempts,
      steps,
      errors,
      attachments,
      annotations: [
        ...(owner ? [{ type: 'owner', description: owner }] : []),
        ...(severity ? [{ type: 'severity', description: severity }] : []),
        ...Object.entries(labels).map(([type, description]) => ({ type, description })),
      ],
      owner,
      severity,
      labels,
      retries,
      startTime: Date.now() - duration,
    };
    parent.tests.push(test);
  }
}

/**
 * Vitest custom reporter.
 *
 * In tests:
 * ```ts
 * import { attach } from '@xqa.io/xreport/context';
 * attach.note({ type: 'json', title: 'payload', value: { ok: true } });
 * attach.meta({ owner: 'platform', severity: 'high' });
 * ```
 * Or set `test.meta({ owner: '…', severity: '…' })` in Vitest.
 */
export default class XReportVitestReporter {
  private options: ReturnType<typeof mergeOptions>;
  private startedAt = Date.now();

  constructor(options: XReportOptions = {}) {
    this.options = mergeOptions(options || {});
  }

  onInit(): void {
    this.startedAt = Date.now();
  }

  onFinished(files: VitestFile[] = []): void {
    const finishedAt = Date.now();
    const media = createMediaStore(path.resolve(this.options.reportDir));
    const root: XReportSuite = {
      id: createId('suite'),
      title: 'Root',
      suites: [],
      tests: [],
    };

    for (const fileNode of files) {
      const abs = fileNode.filepath || fileNode.name;
      const file = abs ? path.relative(process.cwd(), abs) : undefined;
      const suite = file ? ensureSuite(root, path.basename(file), file) : root;
      walkTasks(fileNode.tasks, suite, file, [], media);
    }

    const run = buildRun({
      title: this.options.reportTitle,
      framework: 'vitest',
      startedAt: this.startedAt,
      finishedAt,
      suites: root.suites.length ? root.suites : [root],
      options: this.options,
    });
    void generateReport(run, this.options).finally(() => clearKeyedContext());
  }
}

module.exports = XReportVitestReporter;
