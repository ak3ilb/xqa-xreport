import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_BRANDING,
  TestStatus,
  XReportOptions,
  XReportRun,
  XReportSummary,
  XReportSuite,
  XReportTest,
  XREPORT_VERSION,
  XQA_WEBSITE,
} from './types';

export function createId(prefix = 'x'): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function historyId(fullTitle: string, file?: string): string {
  return crypto
    .createHash('sha1')
    .update(`${file || ''}::${fullTitle}`)
    .digest('hex')
    .slice(0, 16);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function resolveFilename(template: string, status?: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const datetime = `${date}_${time}`;
  return template
    .replace(/\[datetime\]/g, datetime)
    .replace(/\[date\]/g, date)
    .replace(/\[time\]/g, time)
    .replace(/\[timestamp\]/g, String(now.getTime()))
    .replace(/\[status\]/g, status || 'unknown');
}

export function emptySummary(): XReportSummary {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    timedOut: 0,
    flaky: 0,
    duration: 0,
  };
}

export function collectTests(suites: XReportSuite[]): XReportTest[] {
  const out: XReportTest[] = [];
  const walk = (list: XReportSuite[] | undefined) => {
    for (const s of list || []) {
      out.push(...(s.tests || []));
      walk(s.suites);
    }
  };
  walk(suites);
  return out;
}

export function mapSuites(
  suites: XReportSuite[] | undefined,
  mapTest: (t: XReportTest) => XReportTest,
): XReportSuite[] {
  return (suites || []).map((s) => ({
    ...s,
    tests: (s.tests || []).map(mapTest),
    suites: mapSuites(s.suites || [], mapTest),
  }));
}

export function summarize(suites: XReportSuite[], runDuration?: number): XReportSummary {
  const tests = collectTests(suites);
  const summary = emptySummary();
  summary.total = tests.length;
  for (const t of tests) {
    if (t.status === 'passed') summary.passed += 1;
    else if (t.status === 'failed') summary.failed += 1;
    else if (t.status === 'skipped') summary.skipped += 1;
    else if (t.status === 'pending') summary.pending += 1;
    else if (t.status === 'timedOut') summary.timedOut += 1;
    if (t.flaky) summary.flaky += 1;
    summary.duration += t.duration || 0;
  }
  if (typeof runDuration === 'number') summary.duration = runDuration;
  return summary;
}

export function isFlaky(attempts: Array<{ status: TestStatus }>, finalStatus: TestStatus): boolean {
  if (finalStatus !== 'passed' || attempts.length < 2) return false;
  return attempts.some((a) => a.status === 'failed' || a.status === 'timedOut');
}

export function detectEnvironment(): XReportRun['environment'] {
  return {
    os: `${process.platform} ${process.arch}`,
    node: process.version,
    ci: Boolean(process.env.CI),
    branch:
      process.env.GITHUB_REF_NAME ||
      process.env.CI_COMMIT_REF_NAME ||
      process.env.GIT_BRANCH ||
      undefined,
    commit:
      process.env.GITHUB_SHA ||
      process.env.CI_COMMIT_SHA ||
      process.env.GIT_COMMIT ||
      undefined,
    buildUrl: process.env.GITHUB_SERVER_URL
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : process.env.BUILD_URL || process.env.CI_PIPELINE_URL || undefined,
    pipelineUrl:
      process.env.XREPORT_PIPELINE_URL ||
      process.env.CI_PIPELINE_URL ||
      undefined,
    buildId:
      process.env.GITHUB_RUN_ID ||
      process.env.CI_PIPELINE_ID ||
      process.env.BUILD_NUMBER ||
      undefined,
    changeTicket:
      process.env.XREPORT_CHANGE_TICKET ||
      process.env.CHANGE_TICKET ||
      process.env.JIRA_TICKET ||
      undefined,
    changeId: process.env.XREPORT_CHANGE_ID || process.env.CHANGE_ID || undefined,
    actor:
      process.env.GITHUB_ACTOR ||
      process.env.GITLAB_USER_LOGIN ||
      process.env.BUILD_USER ||
      undefined,
  };
}

export function mergeOptions(options: XReportOptions = {}): Required<
  Pick<
    XReportOptions,
    | 'reportDir'
    | 'reportTitle'
    | 'reportFilename'
    | 'autoOpen'
    | 'exportCSV'
    | 'exportPDF'
    | 'exportCtrf'
    | 'saveJson'
    | 'saveHtml'
    | 'showHooks'
    | 'groupByFile'
    | 'reportStrategy'
    | 'quiet'
    | 'charts'
    | 'enableHistory'
    | 'inlineAssets'
  >
> & {
  branding: NonNullable<XReportOptions['branding']>;
  reportPageTitle?: string;
  historyOptions: NonNullable<XReportOptions['historyOptions']>;
  ai?: XReportOptions['ai'];
  knownIssuesPath?: string;
  qualityGate?: XReportOptions['qualityGate'];
  evidencePack?: XReportOptions['evidencePack'];
  privacy?: XReportOptions['privacy'];
  readiness?: XReportOptions['readiness'];
} {
  const truthy = (v: unknown, fallback: boolean) => {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return !['false', '0', 'no', 'off'].includes(v.toLowerCase());
    return Boolean(v);
  };

  const o = options as Record<string, unknown>;
  const enableHistory = truthy(o.enableHistory, false);
  const historyOptions = {
    enabled: true,
    dbPath: './.xreport/history.json',
    maxRecords: 100,
    retentionDays: 30,
    autoCleanup: true,
    // When history is on, keep per-test data so Run History diff / past cases work.
    saveFullResults: enableHistory,
    ...(typeof o.historyOptions === 'object' && o.historyOptions ? (o.historyOptions as object) : {}),
  };

  return {
    reportDir: (o.reportDir as string) || './xreport',
    reportTitle: (o.reportTitle as string) || 'XREPORT',
    reportFilename: (o.reportFilename as string) || 'index',
    reportPageTitle: o.reportPageTitle as string | undefined,
    autoOpen: truthy(o.autoOpen, !process.env.CI),
    exportCSV: truthy(o.exportCSV, false),
    exportPDF: truthy(o.exportPDF, false),
    exportCtrf: truthy(o.exportCtrf, true),
    saveJson: truthy(o.saveJson, true),
    saveHtml: truthy(o.saveHtml, true),
    branding: {
      ...DEFAULT_BRANDING,
      ...(typeof o.branding === 'object' && o.branding ? (o.branding as object) : {}),
      website:
        (typeof o.branding === 'object' && o.branding && (o.branding as any).website) ||
        XQA_WEBSITE,
    },
    showHooks: (o.showHooks as XReportOptions['showHooks']) || 'failed',
    groupByFile: truthy(o.groupByFile, true),
    reportStrategy: (o.reportStrategy as XReportOptions['reportStrategy']) || 'unified',
    quiet: truthy(o.quiet, false),
    charts: truthy(o.charts, true),
    enableHistory,
    inlineAssets: truthy(o.inlineAssets, false),
    historyOptions,
    ai:
      typeof o.ai === 'object' && o.ai
        ? (o.ai as XReportOptions['ai'])
        : undefined,
    knownIssuesPath: (o.knownIssuesPath as string) || undefined,
    qualityGate:
      typeof o.qualityGate === 'object' && o.qualityGate
        ? (o.qualityGate as XReportOptions['qualityGate'])
        : undefined,
    evidencePack: o.evidencePack as XReportOptions['evidencePack'],
    privacy:
      typeof o.privacy === 'object' && o.privacy
        ? (o.privacy as XReportOptions['privacy'])
        : undefined,
    readiness:
      typeof o.readiness === 'object' && o.readiness
        ? (o.readiness as XReportOptions['readiness'])
        : undefined,
  };
}

export function buildRun(input: {
  title: string;
  framework: string;
  startedAt: number;
  finishedAt: number;
  suites: XReportSuite[];
  options?: XReportOptions;
  environment?: XReportRun['environment'];
}): XReportRun {
  const opts = mergeOptions(input.options);
  const duration = Math.max(0, input.finishedAt - input.startedAt);
  return {
    version: XREPORT_VERSION,
    generator: `@xqa.io/xreport@${XREPORT_VERSION}`,
    brand: { name: 'XREPORT', website: XQA_WEBSITE },
    title: input.title || opts.reportTitle,
    framework: input.framework,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    duration,
    summary: summarize(input.suites, duration),
    suites: input.suites,
    environment: { ...detectEnvironment(), ...input.environment },
    branding: opts.branding,
    options: opts,
  };
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function copyFileSafe(src: string, dest: string): string | undefined {
  try {
    if (!fs.existsSync(src)) return undefined;
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return dest;
  } catch {
    return undefined;
  }
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1);
  return `${m}m ${rem}s`;
}
