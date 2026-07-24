/** XREPORT canonical types — https://xqa.io */

import type {
  DefectKind,
  AiInsight,
  AiContextPack,
  XReportAiOptions,
} from './ai-types';

export type { DefectKind, AiInsight, AiContextPack, XReportAiOptions };

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
  /** High-level triage kind (product / automation / environment / flake) */
  defectKind?: DefectKind;
  defectConfidence?: number;
  likelyFixFile?: string;
  /** Matched known-issues.json rule id */
  knownIssueId?: string;
  knownIssueReason?: string;
  /** Muted for quality gates when known issue says mute */
  muted?: boolean;
  stabilityPct?: number;
  testHistory?: XReportTestHistoryPoint[];
  /** Enterprise: @control:ID values */
  controlIds?: string[];
  /** Enterprise: @req:ID values */
  requirementIds?: string[];
  /** Enterprise: @layer:ui|api|batch|reconcile */
  layers?: string[];
  /** Enterprise: @risk:critical|high|standard */
  riskTier?: 'critical' | 'high' | 'standard';
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
  /** Change / ticket id (Jira, ServiceNow, ADO, …) */
  changeTicket?: string;
  changeId?: string;
  buildId?: string;
  pipelineUrl?: string;
  actor?: string;
  riskTier?: string;
  privacyMode?: string;
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
  /** Warn when retentionDays is below this (enterprise profiles) */
  minRetentionDays?: number;
  /** Append tamper-evident ledger lines next to history db */
  ledger?: boolean;
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
  /** Local-first optional AI (OpenAI-compatible). Never required. */
  ai?: XReportAiOptions;
  /** Path to known-issues.json (mute expected failures) */
  knownIssuesPath?: string;
  /** Quality gate evaluated after generate when set; does not fail generate itself */
  qualityGate?: import('./quality-gate').QualityGateRules;
  /** Write evidence pack (folder + zip + seal) after generate */
  evidencePack?: boolean | { output?: string; includeMedia?: boolean };
  /** Privacy scrubbing (PHI/PII-like patterns) — tooling aid, not a certification */
  privacy?: import('./privacy-scrub').PrivacyOptions;
  /** Operational readiness checklist (BlackRock-style pre-prod signals) */
  readiness?: import('./readiness').ReadinessChecklistConfig;
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
    defectKind?: DefectKind;
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
  /** Enterprise control coverage */
  controls?: Array<{
    controlId: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    testIds: string[];
  }>;
  /** Suite topology by @layer */
  byLayer?: Array<{
    layer: string;
    total: number;
    passed: number;
    failed: number;
    flaky: number;
  }>;
  /** Critical-risk failure count */
  criticalFailed?: number;
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
  /** Optional LLM insights keyed by cluster (local-first AI) */
  aiInsights?: AiInsight[];
  /** Evidence pack seal summary (set when pack generated) */
  evidenceSeal?: {
    contentHash: string;
    zipPath?: string;
    generatedAt: string;
  };
  /** Last quality gate evaluation (when qualityGate option or CLI gate ran) */
  gateResult?: import('./quality-gate').QualityGateResult;
  /** Note when this report was merged from shards/workers */
  mergeNote?: string;
  /** Operational readiness evaluation */
  readiness?: import('./readiness').ReadinessResult;
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
  tests?: Array<{
    historyId: string;
    title: string;
    status: TestStatus;
    duration: number;
    project?: string;
    file?: string;
  }>;
}

export const XREPORT_VERSION = '0.7.0';
export const XQA_WEBSITE = 'https://xqa.io';
export const DEFAULT_BRANDING: XReportBranding = {
  projectName: 'XREPORT',
  companyName: 'XQA',
  accentColor: '#0071E3',
  headerColor: '#FFFFFF',
  website: XQA_WEBSITE,
};
