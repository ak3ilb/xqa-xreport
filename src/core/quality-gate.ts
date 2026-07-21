import type { DefectKind } from './ai-types';
import type { XReportRun, XReportTest } from './types';
import { collectTests } from './utils';

export type GatePresetName = 'finance-pr' | 'finance-release' | 'nightly';

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
  /** Require environment.changeTicket or changeId */
  requireChangeTicket?: boolean;
  /** Require environment.commit */
  requireCommit?: boolean;
  /** Max failures on @risk:critical cases */
  maxCriticalFailed?: number;
  /** Named enterprise preset */
  preset?: GatePresetName;
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
    criticalFailed: number;
  };
  violations: string[];
  preset?: GatePresetName;
}

function isFail(t: XReportTest): boolean {
  return t.status === 'failed' || t.status === 'timedOut';
}

export function resolveGatePreset(name?: GatePresetName): QualityGateRules {
  if (name === 'finance-pr') {
    return {
      preset: 'finance-pr',
      maxNewFailures: 0,
      ignoreMuted: true,
      requireChangeTicket: true,
      maxCriticalFailed: 0,
    };
  }
  if (name === 'finance-release') {
    return {
      preset: 'finance-release',
      maxFailed: 0,
      maxProductDefects: 0,
      failOnUnknownDefect: true,
      requireChangeTicket: true,
      requireCommit: true,
      maxCriticalFailed: 0,
      ignoreMuted: true,
    };
  }
  if (name === 'nightly') {
    return {
      preset: 'nightly',
      maxProductDefects: 0,
      ignoreMuted: true,
    };
  }
  return {};
}

export function mergeGateRules(rules: QualityGateRules = {}): QualityGateRules {
  const fromPreset = resolveGatePreset(rules.preset);
  const cleaned: QualityGateRules = {};
  for (const [k, v] of Object.entries(rules) as Array<[keyof QualityGateRules, unknown]>) {
    if (v !== undefined) (cleaned as Record<string, unknown>)[k] = v;
  }
  return { ...fromPreset, ...cleaned, preset: cleaned.preset || fromPreset.preset };
}

export function evaluateQualityGate(
  run: XReportRun,
  rules: QualityGateRules = {},
): QualityGateResult {
  const merged = mergeGateRules(rules);
  const ignoreMuted = merged.ignoreMuted !== false;
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
  const criticalFailed = failed.filter((t) => t.riskTier === 'critical').length;

  const violations: string[] = [];
  if (merged.maxFailed != null && failed.length > merged.maxFailed) {
    violations.push(`failed ${failed.length} > maxFailed ${merged.maxFailed}`);
  }
  if (merged.maxNewFailures != null && newFailures > merged.maxNewFailures) {
    violations.push(`newFailures ${newFailures} > maxNewFailures ${merged.maxNewFailures}`);
  }
  if (merged.maxProductDefects != null && productDefects > merged.maxProductDefects) {
    violations.push(
      `productDefects ${productDefects} > maxProductDefects ${merged.maxProductDefects}`,
    );
  }
  if (merged.maxClusters != null && clusters > merged.maxClusters) {
    violations.push(`clusters ${clusters} > maxClusters ${merged.maxClusters}`);
  }
  if (merged.failOnUnknownDefect && unknownDefects > 0) {
    violations.push(`unknownDefects ${unknownDefects} (failOnUnknownDefect)`);
  }
  if (merged.maxCriticalFailed != null && criticalFailed > merged.maxCriticalFailed) {
    violations.push(
      `criticalFailed ${criticalFailed} > maxCriticalFailed ${merged.maxCriticalFailed}`,
    );
  }
  const env = run.environment || {};
  const ticket =
    (typeof env.changeTicket === 'string' && env.changeTicket) ||
    (typeof env.changeId === 'string' && env.changeId) ||
    '';
  if (merged.requireChangeTicket && !ticket) {
    violations.push('changeTicket missing (requireChangeTicket)');
  }
  if (merged.requireCommit && !(typeof env.commit === 'string' && env.commit)) {
    violations.push('commit missing (requireCommit)');
  }

  const ok = violations.length === 0;
  return {
    ok,
    exitCode: ok ? 0 : 2,
    rules: { ...merged, ignoreMuted },
    counts: {
      failed: failed.length,
      mutedFailed,
      newFailures,
      productDefects,
      clusters,
      unknownDefects,
      criticalFailed,
    },
    violations,
    preset: merged.preset,
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
