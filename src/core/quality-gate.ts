import type { DefectKind } from './ai-types';
import type { XReportRun, XReportTest } from './types';
import { collectTests } from './utils';

export interface QualityGateRules {
  /** Max non-muted failed+timedOut (default unlimited) */
  maxFailed?: number;
  /** Max regressions / new failures (default unlimited) */
  maxNewFailures?: number;
  /** Max failures classified as product (default unlimited) */
  maxProductDefects?: number;
  /** Max unique error clusters among non-muted fails */
  maxClusters?: number;
  /** Ignore muted / known-issue failures (default true) */
  ignoreMuted?: boolean;
  /** Fail when any non-muted failure has defectKind unknown */
  failOnUnknownDefect?: boolean;
}

export interface QualityGateResult {
  ok: boolean;
  exitCode: number;
  rules: Required<Pick<QualityGateRules, 'ignoreMuted'>> & QualityGateRules;
  counts: {
    failed: number;
    mutedFailed: number;
    newFailures: number;
    productDefects: number;
    clusters: number;
    unknownDefects: number;
  };
  violations: string[];
}

function isFail(t: XReportTest): boolean {
  return t.status === 'failed' || t.status === 'timedOut';
}

export function evaluateQualityGate(
  run: XReportRun,
  rules: QualityGateRules = {},
): QualityGateResult {
  const ignoreMuted = rules.ignoreMuted !== false;
  const tests = collectTests(run.suites);
  const failedAll = tests.filter(isFail);
  const failed = ignoreMuted ? failedAll.filter((t) => !t.muted) : failedAll;
  const mutedFailed = failedAll.filter((t) => t.muted).length;
  const newFailures = failed.filter((t) => t.regression).length;
  const productDefects = failed.filter((t) => (t.defectKind as DefectKind) === 'product').length;
  const unknownDefects = failed.filter(
    (t) => !t.defectKind || t.defectKind === 'unknown',
  ).length;
  const clusters = new Set(failed.map((t) => t.clusterId).filter(Boolean)).size;

  const violations: string[] = [];
  if (rules.maxFailed != null && failed.length > rules.maxFailed) {
    violations.push(`failed ${failed.length} > maxFailed ${rules.maxFailed}`);
  }
  if (rules.maxNewFailures != null && newFailures > rules.maxNewFailures) {
    violations.push(`newFailures ${newFailures} > maxNewFailures ${rules.maxNewFailures}`);
  }
  if (rules.maxProductDefects != null && productDefects > rules.maxProductDefects) {
    violations.push(
      `productDefects ${productDefects} > maxProductDefects ${rules.maxProductDefects}`,
    );
  }
  if (rules.maxClusters != null && clusters > rules.maxClusters) {
    violations.push(`clusters ${clusters} > maxClusters ${rules.maxClusters}`);
  }
  if (rules.failOnUnknownDefect && unknownDefects > 0) {
    violations.push(`unknownDefects ${unknownDefects} (failOnUnknownDefect)`);
  }

  const ok = violations.length === 0;
  return {
    ok,
    exitCode: ok ? 0 : 2,
    rules: { ...rules, ignoreMuted },
    counts: {
      failed: failed.length,
      mutedFailed,
      newFailures,
      productDefects,
      clusters,
      unknownDefects,
    },
    violations,
  };
}

/** Write a simple quarantine skip list (titles / historyIds) for CI grep invert. */
export function buildQuarantineExport(run: XReportRun): {
  lines: string[];
  commandHint: string;
} {
  const tips = run.analytics?.quarantine || [];
  const muted = collectTests(run.suites).filter((t) => t.muted || t.flaky);
  const lines = [
    '# XREPORT quarantine export — guidance only; review before skipping in CI',
    `# Generated for run: ${run.title}`,
    '',
  ];
  for (const q of tips) {
    lines.push(`# tip ${q.stabilityPct}% — ${q.reason}`);
    lines.push(q.historyId);
  }
  for (const t of muted) {
    if (tips.some((q) => q.historyId === t.historyId)) continue;
    lines.push(`# ${t.muted ? 'muted' : 'flaky'} ${t.fullTitle}`);
    if (t.historyId) lines.push(t.historyId);
  }
  return {
    lines,
    commandHint:
      'Review historyIds above, then skip via your runner (e.g. Playwright grep-invert / Jest testPathIgnorePatterns).',
  };
}
