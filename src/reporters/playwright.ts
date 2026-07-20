import * as path from 'path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from './playwright-types';
import { createMediaStore, storeAttachment } from '../core/media';
import type {
  TestStatus,
  XReportHook,
  XReportLogLine,
  XReportOptions,
  XReportStep,
  XReportSuite,
  XReportTest,
} from '../core/types';
import {
  buildRun,
  createId,
  historyId,
  isFlaky,
  mergeOptions,
} from '../core/utils';
import { generateReport } from '../generator';

function mapStatus(status: TestResult['status']): TestStatus {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'timedOut') return 'timedOut';
  if (status === 'interrupted') return 'interrupted';
  return 'skipped';
}

function chunkText(chunks?: Array<{ text?: string } | string>): string {
  if (!chunks?.length) return '';
  return chunks
    .map((c) => (typeof c === 'string' ? c : c?.text || ''))
    .join('');
}

function extractMeta(annotations: Array<{ type: string; description?: string }> = []) {
  const labels: Record<string, string> = {};
  const annotationTags: string[] = [];
  let owner: string | undefined;
  let severity: string | undefined;
  for (const a of annotations) {
    const key = (a.type || '').toLowerCase();
    const val = (a.description || '').trim();
    if (key === 'owner') owner = val || owner;
    else if (key === 'severity') severity = val || severity;
    else if ((key === 'tag' || key === 'tags') && val) {
      for (const part of val.split(/[,\s]+/).filter(Boolean)) {
        const tag = part.startsWith('@') ? part : `@${part}`;
        if (!annotationTags.includes(tag)) annotationTags.push(tag);
      }
    } else if (val) labels[key] = val;
  }
  return { owner, severity, labels, annotationTags };
}

function mergeTags(testTags: string[] = [], annotationTags: string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...testTags, ...annotationTags]) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const norm = t.startsWith('@') ? t : `@${t}`;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}

function extractHooks(steps: NonNullable<TestResult['steps']>): {
  hooks: XReportHook[];
  steps: NonNullable<TestResult['steps']>;
} {
  const hooks: XReportHook[] = [];
  const rest: NonNullable<TestResult['steps']> = [];

  const pushHook = (s: (typeof steps)[number]) => {
    const title = s.title || '';
    let type: XReportHook['type'] = 'hook';
    if (/beforeall|before all/i.test(title)) type = 'beforeAll';
    else if (/afterall|after all/i.test(title)) type = 'afterAll';
    else if (/beforeeach|before each/i.test(title)) type = 'beforeEach';
    else if (/aftereach|after each/i.test(title)) type = 'afterEach';
    hooks.push({
      title,
      type,
      status: s.error ? 'failed' : 'passed',
      duration: s.duration,
      error: s.error
        ? { message: s.error.message || String(s.error), stack: s.error.stack }
        : undefined,
    });
  };

  for (const s of steps) {
    const cat = (s.category || '').toLowerCase();
    const title = s.title || '';
    const isHook =
      cat === 'hook' ||
      /beforeall|afterall|beforeeach|aftereach|before all|after all|before each|after each/i.test(
        title,
      );
    const isHookGroup = /^(before|after)\s+hooks$/i.test(title.trim());
    if (isHookGroup && s.steps?.length) {
      for (const child of s.steps) pushHook(child);
      continue;
    }
    if (isHook) {
      pushHook(s);
    } else {
      rest.push(s);
    }
  }
  return { hooks, steps: rest };
}

function mapPwStep(s: NonNullable<TestResult['steps']>[number]): XReportStep {
  const children = (s.steps || []).map(mapPwStep);
  return {
    title: s.title || 'step',
    status: s.error ? 'failed' : 'passed',
    duration: s.duration || 0,
    category: s.category,
    error: s.error
      ? { message: s.error.message || String(s.error), stack: s.error.stack }
      : undefined,
    steps: children.length ? children : undefined,
  };
}

export default class XReportPlaywrightReporter implements Reporter {
  private options: ReturnType<typeof mergeOptions>;
  private startedAt = Date.now();
  private rootSuite: Suite | undefined;
  private results = new Map<string, TestResult[]>();

  constructor(options: XReportOptions = {}) {
    this.options = mergeOptions(options);
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startedAt = Date.now();
    this.rootSuite = suite;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const key = test.id;
    const list = this.results.get(key) || [];
    list.push(result);
    this.results.set(key, list);
  }

  async onEnd(_result: FullResult): Promise<void> {
    const finishedAt = Date.now();
    const media = createMediaStore(path.resolve(this.options.reportDir));
    const suites = this.rootSuite
      ? this.convertSuites(this.rootSuite.suites, media)
      : [];

    const run = buildRun({
      title: this.options.reportTitle,
      framework: 'playwright',
      startedAt: this.startedAt,
      finishedAt,
      suites,
      options: this.options,
    });

    await generateReport(run, this.options);
  }

  printsToStdio(): boolean {
    return false;
  }

  private convertSuites(
    suites: Suite[],
    media: ReturnType<typeof createMediaStore>,
  ): XReportSuite[] {
    return suites.map((suite) => ({
      id: createId('suite'),
      title: suite.title || suite.location?.file || 'Suite',
      file: suite.location?.file,
      suites: this.convertSuites(suite.suites, media),
      tests: suite.tests.map((t) => this.convertTest(t, media)),
    }));
  }

  private convertTest(
    test: TestCase,
    media: ReturnType<typeof createMediaStore>,
  ): XReportTest {
    const attemptsRaw = this.results.get(test.id) || [];
    const attempts = attemptsRaw.map((r) => ({
      status: mapStatus(r.status),
      duration: r.duration,
      errors: (r.errors || []).map((e) => ({
        message: e.message || String(e),
        stack: e.stack,
        value: e.value ? String(e.value) : undefined,
      })),
      startedAt: r.startTime ? new Date(r.startTime).getTime() : undefined,
    }));

    const last = attemptsRaw[attemptsRaw.length - 1];
    const outcome = test.outcome();
    let status: TestStatus = last ? mapStatus(last.status) : 'skipped';
    if (outcome === 'flaky') status = 'passed';
    if (outcome === 'skipped') status = 'skipped';

    const flaky = outcome === 'flaky' || isFlaky(attempts, status);
    const attachments = [];
    for (const r of attemptsRaw) {
      for (const a of r.attachments || []) {
        const type =
          a.name === 'trace' || a.contentType?.includes('zip')
            ? 'trace'
            : a.contentType?.startsWith('video')
              ? 'video'
              : a.contentType?.startsWith('image')
                ? 'screenshot'
                : 'file';
        attachments.push(
          storeAttachment(media, {
            name: a.name || type,
            type,
            source: a.path,
            body: a.body,
            contentType: a.contentType,
          }),
        );
      }
    }

    const rawSteps = last?.steps || [];
    const { hooks, steps: filteredSteps } = extractHooks(rawSteps);
    const steps = filteredSteps.map(mapPwStep);

    if ((status === 'failed' || status === 'timedOut') && steps.length) {
      const anyFailed = (function hasFail(list: XReportStep[]): boolean {
        return list.some((s) => s.status === 'failed' || (s.steps ? hasFail(s.steps) : false));
      })(steps);
      if (!anyFailed && last?.errors?.length) {
        const markLeaf = (list: XReportStep[]): XReportStep[] => {
          if (!list.length) return list;
          const lastStep = list[list.length - 1];
          if (lastStep.steps?.length) {
            return [
              ...list.slice(0, -1),
              { ...lastStep, steps: markLeaf(lastStep.steps), status: 'failed' },
            ];
          }
          return [
            ...list.slice(0, -1),
            {
              ...lastStep,
              status: 'failed',
              error: {
                message: last.errors[0]?.message || 'Failed',
                stack: last.errors[0]?.stack,
              },
            },
          ];
        };
        steps.splice(0, steps.length, ...markLeaf(steps));
      }
    }

    const projectName =
      (test as { parent?: { project?: () => { name?: string } | undefined } }).parent?.project?.()
        ?.name || '';

    const stdoutParts: string[] = [];
    const stderrParts: string[] = [];
    const logs: XReportLogLine[] = [];
    for (const r of attemptsRaw) {
      const out = chunkText(r.stdout);
      const err = chunkText(r.stderr);
      if (out) {
        stdoutParts.push(out);
        logs.push({ type: 'stdout', text: out });
      }
      if (err) {
        stderrParts.push(err);
        logs.push({ type: 'stderr', text: err });
      }
    }

    const meta = extractMeta(test.annotations || []);
    const startTime = last?.startTime ? new Date(last.startTime).getTime() : undefined;
    const workerIndex =
      typeof last?.workerIndex === 'number'
        ? last.workerIndex
        : typeof last?.parallelIndex === 'number'
          ? last.parallelIndex
          : undefined;

    return {
      id: createId('test'),
      historyId: historyId(test.titlePath().join(' › '), test.location.file),
      title: test.title,
      fullTitle: test.titlePath().slice(1).join(' › '),
      status,
      flaky,
      duration: attempts.reduce((n, a) => n + a.duration, 0),
      file: test.location.file,
      line: test.location.line,
      project: projectName,
      tags: mergeTags(test.tags || [], meta.annotationTags),
      attempts: attempts.length ? attempts : [{ status, duration: 0, errors: [] }],
      steps,
      errors: last
        ? (last.errors || []).map((e) => ({
            message: e.message || String(e),
            stack: e.stack,
          }))
        : [],
      attachments,
      annotations: (test.annotations || []).map((a) => ({
        type: a.type,
        description: a.description,
      })),
      stdout: stdoutParts.join('\n') || undefined,
      stderr: stderrParts.join('\n') || undefined,
      logs: logs.length ? logs : undefined,
      owner: meta.owner,
      severity: meta.severity,
      labels: Object.keys(meta.labels).length ? meta.labels : undefined,
      hooks: hooks.length ? hooks : undefined,
      workerIndex,
      startTime,
      retries: Math.max(0, attempts.length - 1),
    };
  }
}
