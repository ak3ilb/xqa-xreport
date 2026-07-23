import * as fs from 'fs';
import * as path from 'path';
import type { XReportRun, XReportTest } from './types';
import { collectTests } from './utils';

export interface KnownIssueMatch {
  /** Exact historyId */
  historyId?: string;
  /** Exact cluster id (signature hash) */
  clusterId?: string;
  /** Substring match on normalized or raw errorSignature / message */
  signatureContains?: string;
  /** Substring match on fullTitle / title */
  titleContains?: string;
  /** RegExp source matched against fullTitle */
  titleRegex?: string;
}

export interface KnownIssueRule {
  id: string;
  reason?: string;
  /** When true, failures matching this rule are muted for quality gates */
  mute?: boolean;
  match: KnownIssueMatch;
}

export interface KnownIssuesFile {
  version: 1;
  issues: KnownIssueRule[];
}

export interface KnownIssueHit {
  ruleId: string;
  reason?: string;
  mute: boolean;
}

function loadFile(filePath: string): KnownIssuesFile {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as KnownIssuesFile;
  if (!raw || !Array.isArray(raw.issues)) {
    throw new Error(`Invalid known-issues file: ${filePath}`);
  }
  return { version: 1, issues: raw.issues };
}

export function resolveKnownIssuesPath(options?: {
  knownIssuesPath?: string;
  reportDir?: string;
}): string | undefined {
  if (options?.knownIssuesPath) return path.resolve(options.knownIssuesPath);
  const candidates = [
    path.resolve('./xreport-known-issues.json'),
    path.resolve('./.xreport/known-issues.json'),
    options?.reportDir ? path.join(path.resolve(options.reportDir), 'known-issues.json') : '',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

export function matchesKnownIssue(test: XReportTest, rule: KnownIssueRule): boolean {
  const m = rule.match || ({} as KnownIssueMatch);
  if (m.historyId && test.historyId === m.historyId) return true;
  if (m.clusterId && test.clusterId === m.clusterId) return true;
  if (m.signatureContains) {
    const hay = `${test.errorSignature || ''} ${test.errors[0]?.message || ''}`.toLowerCase();
    if (hay.includes(m.signatureContains.toLowerCase())) return true;
  }
  if (m.titleContains) {
    const hay = `${test.fullTitle || ''} ${test.title || ''}`.toLowerCase();
    if (hay.includes(String(m.titleContains).toLowerCase())) return true;
  }
  if (m.titleRegex) {
    try {
      if (new RegExp(m.titleRegex, 'i').test(test.fullTitle || test.title)) return true;
    } catch {
      // invalid regex — ignore rule
    }
  }
  return false;
}

export function findKnownIssue(
  test: XReportTest,
  issues: KnownIssueRule[],
): KnownIssueHit | undefined {
  for (const rule of issues) {
    if (!matchesKnownIssue(test, rule)) continue;
    return {
      ruleId: rule.id,
      reason: rule.reason,
      mute: rule.mute !== false,
    };
  }
  return undefined;
}

/** Stamp knownIssue / muted on failing tests. Safe no-op when file missing. */
export function applyKnownIssues(
  run: XReportRun,
  knownIssuesPath?: string,
): XReportRun {
  const filePath =
    knownIssuesPath ||
    resolveKnownIssuesPath({
      knownIssuesPath: run.options?.knownIssuesPath,
      reportDir: run.options?.reportDir,
    });
  if (!filePath || !fs.existsSync(filePath)) return run;

  let issues: KnownIssueRule[] = [];
  try {
    issues = loadFile(filePath).issues;
  } catch (err) {
    if (!run.options?.quiet) {
      console.warn(
        '[xreport] known-issues skipped:',
        err instanceof Error ? err.message : String(err),
      );
    }
    return run;
  }
  if (!issues.length) return run;

  const walk = (suites: XReportRun['suites'] | undefined): XReportRun['suites'] =>
    (suites || []).map((s) => ({
      ...s,
      suites: walk(s.suites),
      tests: (s.tests || []).map((t) => {
        const isFail = t.status === 'failed' || t.status === 'timedOut';
        if (!isFail && !t.flaky) return t;
        const hit = findKnownIssue(t, issues);
        if (!hit) return t;
        return {
          ...t,
          knownIssueId: hit.ruleId,
          knownIssueReason: hit.reason,
          muted: hit.mute,
        };
      }),
    }));

  return { ...run, suites: walk(run.suites) };
}

export function listKnownIssueMatches(
  run: XReportRun,
  knownIssuesPath?: string,
): Array<{ testId: string; fullTitle: string; ruleId: string; muted: boolean; reason?: string }> {
  const withKi = applyKnownIssues(run, knownIssuesPath);
  return collectTests(withKi.suites)
    .filter((t) => t.knownIssueId)
    .map((t) => ({
      testId: t.id,
      fullTitle: t.fullTitle,
      ruleId: t.knownIssueId!,
      muted: !!t.muted,
      reason: t.knownIssueReason,
    }));
}
