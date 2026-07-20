/** XREPORT canonical types — https://xqa.io */

export type TestStatus =
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'pending'
  | 'timedOut'
  | 'interrupted';

export type ContextType =
  | 'text'
  | 'json'
  | 'code'
  | 'screenshot'
  | 'video'
  | 'file'
  | 'trace'
  | 'network'
  | 'dom'
  | 'diff';

export type FailureCategory = 'timing' | 'environment' | 'network' | 'assertion' | 'other';

export interface XReportError {
  message: string;
  stack?: string;
  value?: string;
}

export interface XReportAttachment {
  id: string;
  name: string;
  type: ContextType;
  path?: string;
  contentType?: string;
  body?: string;
}

export interface XReportAttempt {
  status: TestStatus;
  duration: number;
  errors: XReportError[];
  startedAt?: number;
  finishedAt?: number;
}

export interface XReportStep {
  title: string;
  status: TestStatus;
  duration: number;
  error?: XReportError;
  slow?: boolean;
  category?: string;
  /** Nested Playwright `test.step` children */
  steps?: XReportStep[];
}

export interface XReportHook {
  title: string;
  type: 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach' | 'hook';
  status: TestStatus;
  duration: number;
  error?: XReportError;
}

export interface XReportLogLine {
  type: 'stdout' | 'stderr' | 'console';
  text: string;
  timestamp?: number;
}

export interface XReportCoverageSummary {
  lines?: number;
  statements?: number;
  branches?: number;
  functions?: number;
}

export interface XReportTestHistoryPoint {
  date: number;
  status: TestStatus;
  duration: number;
}

export interface XReportTest {
  id: string;
  historyId: string;
  title: string;
  fullTitle: string;
  status: TestStatus;
  /** True when failed then passed on a later retry */
  flaky: boolean;
  duration: number;
  file?: string;
  line?: number;
  project?: string;
  tags: string[];
  attempts: XReportAttempt[];
  steps: XReportStep[];
  errors: XReportError[];
  attachments: XReportAttachment[];
  annotations: Array<{ type: string; description?: string }>;
  errorSignature?: string;
  clusterId?: string;
  regression?: boolean;
  stdout?: string;
  stderr?: string;
  logs?: XReportLogLine[];
  owner?: string;
  severity?: string;
  labels?: Record<string, string>;
  hooks?: XReportHook[];
  workerIndex?: number;
  startTime?: number;
  retries?: number;
  coverageSummary?: XReportCoverageSummary;
  failureCategory?: FailureCategory;
  stabilityPct?: number;
  testHistory?: XReportTestHistoryPoint[];
}

export interface XReportSuite {
  id: string;
  title: string;
  file?: string;
  suites: XReportSuite[];
  tests: XReportTest[];
}

export interface XReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  timedOut: number;
  flaky: number;
  duration: number;
}

export interface XReportEnvironment {
  os?: string;
  node?: string;
  browser?: string;
  baseURL?: string;
  ci?: boolean;
  branch?: string;
  commit?: string;
  buildUrl?: string;
  [key: string]: string | boolean | undefined;
}

export interface XReportBranding {
  projectName?: string;
  companyName?: string;
  logo?: string;
  headerColor?: string;
  accentColor?: string;
  website?: string;
}

export interface XReportHistoryOptions {
  enabled?: boolean;
  dbPath?: string;
  maxRecords?: number;
  retentionDays?: number;
  autoCleanup?: boolean;
  saveFullResults?: boolean;
}

export interface XReportOptions {
  reportDir?: string;
  reportTitle?: string;
  reportFilename?: string;
  reportPageTitle?: string;
  autoOpen?: boolean;
  exportCSV?: boolean;
  exportPDF?: boolean;
  exportCtrf?: boolean;
  saveJson?: boolean;
  saveHtml?: boolean;
  branding?: XReportBranding;
  showHooks?: 'always' | 'failed' | 'context' | 'never';
  groupByFile?: boolean;
  reportStrategy?: 'unified' | 'separate' | 'per-file';
  quiet?: boolean;
  charts?: boolean;
  enableHistory?: boolean;
  historyOptions?: XReportHistoryOptions;
  inlineAssets?: boolean;
}

export interface XReportAnalytics {
  slowest: Array<{ historyId: string; title: string; duration: number; status: TestStatus }>;
  byFile: Array<{ file: string; total: number; passed: number; failed: number; flaky: number }>;
  tagHealth: Array<{ tag: string; total: number; passed: number; failed: number; passRate: number }>;
  clusters: Array<{
    id: string;
    signature: string;
    count: number;
    sample: string;
    testIds: string[];
    category?: FailureCategory;
  }>;
  regressions: Array<{ historyId: string; title: string }>;
  byProject: Array<{
    project: string;
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
  }>;
  delta?: {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    duration: number;
  };
  stabilityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  stabilityScore: number;
  historyTrend: Array<{ date: number; passRate: number; failed: number; total: number; duration: number }>;
  coverage?: XReportCoverageSummary;
  byCategory: Array<{ category: FailureCategory; count: number }>;
  quarantine: Array<{
    historyId: string;
    title: string;
    stabilityPct: number;
    category?: FailureCategory;
    reason: string;
  }>;
  byEnvironment: Array<{
    key: string;
    label: string;
    runs: number;
    passRate: number;
  }>;
  historyRuns: Array<{
    id: string;
    date: number;
    title: string;
    framework: string;
    summary: XReportSummary;
    branch?: string;
    env?: string;
    passRate: number;
    tests?: Array<{
      id: string;
      historyId?: string;
      title: string;
      status: TestStatus;
      duration: number;
      flaky?: boolean;
    }>;
  }>;
  failedRerun?: {
    command: string;
    files: string[];
    count: number;
  };
}

export interface XReportRun {
  version: string;
  generator: string;
  brand: {
    name: string;
    website: string;
  };
  title: string;
  framework: string;
  startedAt: number;
  finishedAt: number;
  duration: number;
  summary: XReportSummary;
  suites: XReportSuite[];
  environment: XReportEnvironment;
  branding: XReportBranding;
  options: Partial<XReportOptions>;
  analytics?: XReportAnalytics;
  coverageSummary?: XReportCoverageSummary;
}

export interface HistoryRecord {
  id: string;
  date: number;
  framework: string;
  title: string;
  summary: XReportSummary;
  environment?: XReportEnvironment;
  failedIds: string[];
  passedIds: string[];
  tests?: Array<{ historyId: string; title: string; status: TestStatus; duration: number }>;
}

export const XREPORT_VERSION = '0.4.0';
export const XQA_WEBSITE = 'https://xqa.io';
export const DEFAULT_BRANDING: XReportBranding = {
  projectName: 'XREPORT',
  companyName: 'XQA',
  accentColor: '#0071E3',
  headerColor: '#FFFFFF',
  website: XQA_WEBSITE,
};
