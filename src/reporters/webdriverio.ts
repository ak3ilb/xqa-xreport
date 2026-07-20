import * as fs from 'fs';
import * as path from 'path';
import { createMediaStore, storeAttachment } from '../core/media';
import type { TestStatus, XReportOptions, XReportSuite, XReportTest } from '../core/types';
import {
  buildRun,
  createId,
  ensureDir,
  historyId,
  isFlaky,
  mergeOptions,
  readJson,
  writeJson,
} from '../core/utils';
import { generateReport, mergeRuns } from '../generator';
import type { XReportRun } from '../core/types';

type WDIOBase = new (...args: any[]) => {
  write(payload: unknown): void;
  isMultiremote?: boolean;
  cid?: string;
  options?: any;
};

function loadWdioReporter(): WDIOBase {
  try {
    return require('@wdio/reporter').default;
  } catch {
    // Minimal fallback base
    return class {
      constructor(_opts: any) {}
      write() {}
    } as unknown as WDIOBase;
  }
}

function mapStatus(state?: string): TestStatus {
  const s = (state || '').toLowerCase();
  if (s === 'passed') return 'passed';
  if (s === 'failed') return 'failed';
  if (s === 'pending' || s === 'skipped') return s === 'pending' ? 'pending' : 'skipped';
  return 'skipped';
}

const WDIOReporter = loadWdioReporter();

/**
 * WebdriverIO reporter — each worker writes a partial JSON;
 * the completing process merges workers into one XREPORT.
 */
export default class XReportWebdriverIOReporter extends WDIOReporter {
  private xoptions: ReturnType<typeof mergeOptions>;
  private startedAt = Date.now();
  private suites: XReportSuite[] = [];
  private suiteStack: XReportSuite[] = [];
  private currentTest: XReportTest | undefined;
  private media: ReturnType<typeof createMediaStore>;
  private partialsDir: string;

  constructor(options: XReportOptions = {}) {
    super(options);
    this.xoptions = mergeOptions(options);
    this.media = createMediaStore(path.resolve(this.xoptions.reportDir));
    this.partialsDir = path.join(this.xoptions.reportDir, '.partials');
    ensureDir(this.partialsDir);
  }

  onRunnerStart(): void {
    this.startedAt = Date.now();
  }

  onSuiteStart(suite: { title: string; file?: string }): void {
    const node: XReportSuite = {
      id: createId('suite'),
      title: suite.title,
      file: suite.file,
      suites: [],
      tests: [],
    };
    if (this.suiteStack.length === 0) this.suites.push(node);
    else this.suiteStack[this.suiteStack.length - 1].suites.push(node);
    this.suiteStack.push(node);
  }

  onSuiteEnd(): void {
    this.suiteStack.pop();
  }

  onTestStart(test: {
    title: string;
    fullTitle?: string;
    tags?: string[];
    cid?: string;
  }): void {
    const parent = this.suiteStack[this.suiteStack.length - 1];
    const fullTitle = test.fullTitle || test.title;
    const cid = (this as any).cid || test.cid || process.env.WDIO_WORKER_ID;
    const workerIndex =
      typeof cid === 'string' && /\d+/.test(cid) ? Number(cid.match(/\d+/)?.[0]) : undefined;
    this.currentTest = {
      id: createId('test'),
      historyId: historyId(fullTitle),
      title: test.title,
      fullTitle,
      status: 'pending',
      flaky: false,
      duration: 0,
      tags: test.tags || (test.title.match(/@[\w-]+/g) || []),
      attempts: [],
      steps: [],
      errors: [],
      attachments: [],
      annotations: [],
      workerIndex,
      startTime: Date.now(),
    };
    parent?.tests.push(this.currentTest);
  }

  onTestPass(test: { duration?: number }): void {
    this.finishTest('passed', test.duration || 0);
  }

  onTestFail(test: { duration?: number; error?: any }): void {
    if (this.currentTest && test.error) {
      this.currentTest.errors = [
        {
          message: test.error.message || String(test.error),
          stack: test.error.stack,
        },
      ];
    }
    this.finishTest('failed', test.duration || 0);
  }

  onTestSkip(): void {
    this.finishTest('skipped', 0);
  }

  onRunnerEnd(): void {
    const finishedAt = Date.now();
    const cid = (this as any).cid || process.env.WDIO_WORKER_ID || String(process.pid);
    const partialPath = path.join(this.partialsDir, `worker-${cid}.json`);
    const run = buildRun({
      title: this.xoptions.reportTitle,
      framework: 'webdriverio',
      startedAt: this.startedAt,
      finishedAt,
      suites: this.suites,
      options: { ...this.xoptions, autoOpen: false, quiet: true },
    });
    writeJson(partialPath, run);

    // Attempt merge of all partials
    try {
      const files = fs
        .readdirSync(this.partialsDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(this.partialsDir, f));
      if (!files.length) return;
      const runs = files.map((f) => readJson<XReportRun>(f));
      const merged = mergeRuns(runs);
      void generateReport(merged, this.xoptions);
    } catch (err) {
      if (!this.xoptions.quiet) {
        console.warn('[xreport] WDIO merge warning', err);
      }
    }
  }

  private finishTest(status: TestStatus, duration: number): void {
    if (!this.currentTest) return;
    this.currentTest.attempts.push({
      status,
      duration,
      errors: this.currentTest.errors,
      startedAt: this.currentTest.startTime,
    });
    this.currentTest.status = status;
    this.currentTest.duration = this.currentTest.attempts.reduce((n, a) => n + a.duration, 0);
    this.currentTest.flaky = isFlaky(this.currentTest.attempts, status);
    this.currentTest.retries = Math.max(0, this.currentTest.attempts.length - 1);
    this.currentTest = undefined;
  }

  /** Helper for users to attach screenshots from tests */
  static attachScreenshot(test: XReportTest | undefined, filePath: string, name = 'Screenshot') {
    // used via context API instead
    void test;
    void filePath;
    void name;
    void storeAttachment;
  }
}

module.exports = XReportWebdriverIOReporter;
