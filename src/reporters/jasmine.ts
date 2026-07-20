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

function mapStatus(status: string): TestStatus {
  const s = (status || '').toLowerCase();
  if (s === 'passed' || s === 'pass') return 'passed';
  if (s === 'failed' || s === 'fail') return 'failed';
  if (s === 'pending') return 'pending';
  return 'skipped';
}

export default class XReportJasmineReporter {
  private options: ReturnType<typeof mergeOptions>;
  private startedAt = Date.now();
  private root: XReportSuite = {
    id: createId('suite'),
    title: 'Root',
    suites: [],
    tests: [],
  };
  private stack: XReportSuite[] = [this.root];
  private media: ReturnType<typeof createMediaStore>;
  private attemptMap = new Map<string, XReportTest['attempts']>();

  constructor(options: XReportOptions = {}) {
    this.options = mergeOptions(options);
    this.media = createMediaStore(path.resolve(this.options.reportDir));
  }

  jasmineStarted(): void {
    this.startedAt = Date.now();
  }

  suiteStarted(result: { description: string }): void {
    const node: XReportSuite = {
      id: createId('suite'),
      title: result.description,
      suites: [],
      tests: [],
    };
    this.stack[this.stack.length - 1].suites.push(node);
    this.stack.push(node);
  }

  suiteDone(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  specDone(result: any): void {
    const parent = this.stack[this.stack.length - 1];
    const status = mapStatus(result.status);
    const fullTitle = [...this.stack.slice(1).map((s) => s.title), result.description].join(
      ' › ',
    );
    const key = fullTitle;
    const attempts = this.attemptMap.get(key) || [];
    const failedExpectations = result.failedExpectations || [];
    attempts.push({
      status,
      duration: result.duration || 0,
      errors: failedExpectations.map((e: any) => ({
        message: e.message,
        stack: e.stack,
      })),
    });
    this.attemptMap.set(key, attempts);

    const ctx = takeAttachments(result).map((a) =>
      storeAttachment(this.media, {
        name: a.name,
        type: a.type,
        source: a.path,
        body: a.body,
        contentType: a.contentType,
      }),
    );

    const flaky = isFlaky(attempts, status);
    const existing = parent.tests.find((t) => t.fullTitle === fullTitle);
    const tags: string[] = (result.description || '').match(/@[\w-]+/g) || [];
    const payload: XReportTest = {
      id: existing?.id || createId('test'),
      historyId: historyId(fullTitle),
      title: result.description,
      fullTitle,
      status,
      flaky,
      duration: attempts.reduce((n, a) => n + a.duration, 0),
      tags,
      attempts: [...attempts],
      steps: [],
      errors: failedExpectations.map((e: any) => ({
        message: e.message,
        stack: e.stack,
      })),
      attachments: [...(existing?.attachments || []), ...ctx],
      annotations: [],
      retries: Math.max(0, attempts.length - 1),
      startTime: Date.now() - (result.duration || 0),
    };
    if (existing) Object.assign(existing, payload);
    else parent.tests.push(payload);
  }

  jasmineDone(): void | Promise<void> {
    const finishedAt = Date.now();
    const run = buildRun({
      title: this.options.reportTitle,
      framework: 'jasmine',
      startedAt: this.startedAt,
      finishedAt,
      suites: this.root.suites.length ? this.root.suites : [this.root],
      options: this.options,
    });
    return generateReport(run, this.options).then(() => undefined);
  }
}

module.exports = XReportJasmineReporter;
