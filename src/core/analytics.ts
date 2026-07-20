import * as crypto from 'crypto';
import type {
  FailureCategory,
  HistoryRecord,
  TestStatus,
  XReportAnalytics,
  XReportCoverageSummary,
  XReportRun,
  XReportStep,
  XReportSummary,
  XReportTest,
  XReportTestHistoryPoint,
} from './types';
import { collectTests } from './utils';

export function normalizeErrorSignature(message?: string): string {
  if (!message) return 'unknown';
  return message
    .replace(/\d+/g, 'N')
    .replace(/0x[0-9a-f]+/gi, 'HEX')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
    .toLowerCase();
}

export function errorSignatureHash(message?: string): string {
  return crypto.createHash('sha1').update(normalizeErrorSignature(message)).digest('hex').slice(0, 10);
}

export function classifyFailure(message?: string, stack?: string): FailureCategory {
  const text = `${message || ''} ${stack || ''}`.toLowerCase();
  if (
    /timeout|timed out|exceeded|waiting for|slow|net::err_timed|etag/i.test(text) ||
    /retry.*timeout/i.test(text)
  ) {
    return 'timing';
  }
  if (
    /econnrefused|enotfound|fetch failed|socket hang up|net::err_|dns|502|503|504|cors|network/i.test(
      text,
    )
  ) {
    return 'network';
  }
  if (
    /expected|assert|tobe|toequal|tohave|to contain|matcher|expect\(|assertion/i.test(text)
  ) {
    return 'assertion';
  }
  if (
    /enoent|permission|env|environment|undefined is not|cannot find module|ci=|browser closed|target closed|crash/i.test(
      text,
    )
  ) {
    return 'environment';
  }
  return 'other';
}

export function markSlowSteps(steps: XReportStep[]): XReportStep[] {
  if (!steps.length) return steps;
  const flat: XReportStep[] = [];
  const walk = (list: XReportStep[]) => {
    for (const s of list) {
      flat.push(s);
      if (s.steps?.length) walk(s.steps);
    }
  };
  walk(steps);
  const sorted = [...flat].sort((a, b) => b.duration - a.duration);
  const threshold = Math.max(2500, sorted[0]?.duration * 0.4 || 0);
  const slowIds = new Set(
    sorted.filter((s) => s.duration >= threshold).slice(0, 8).map((s) => s.title + s.duration),
  );
  const mark = (list: XReportStep[]): XReportStep[] =>
    list.map((s) => ({
      ...s,
      slow: slowIds.has(s.title + s.duration) || s.duration >= 2500,
      steps: s.steps?.length ? mark(s.steps) : s.steps,
    }));
  return mark(steps);
}

function labelsFromAnnotations(
  annotations: XReportTest['annotations'],
): {
  owner?: string;
  severity?: string;
  labels: Record<string, string>;
  annotationTags: string[];
} {
  const labels: Record<string, string> = {};
  const annotationTags: string[] = [];
  let owner: string | undefined;
  let severity: string | undefined;
  for (const a of annotations || []) {
    const key = (a.type || '').toLowerCase();
    const val = (a.description || '').trim();
    if (key === 'owner' || key === 'annot:owner') owner = val || owner;
    else if (key === 'severity' || key === 'annot:severity') severity = val || severity;
    else if ((key === 'tag' || key === 'tags') && val) {
      for (const part of val.split(/[,\s]+/).filter(Boolean)) {
        const tag = part.startsWith('@') ? part : `@${part}`;
        if (!annotationTags.includes(tag)) annotationTags.push(tag);
      }
    } else if (key === 'jira' || key === 'label' || key.startsWith('label:')) {
      labels[key.replace(/^label:/, '')] = val;
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

function historyForTest(
  historyId: string,
  records: HistoryRecord[],
): XReportTestHistoryPoint[] {
  const points: XReportTestHistoryPoint[] = [];
  for (const r of records) {
    if (r.tests?.length) {
      const hit = r.tests.find((t) => t.historyId === historyId);
      if (hit) {
        points.push({ date: r.date, status: hit.status, duration: hit.duration });
        continue;
      }
    }
    if (r.failedIds.includes(historyId)) {
      points.push({ date: r.date, status: 'failed', duration: 0 });
    } else if (r.passedIds.includes(historyId)) {
      points.push({ date: r.date, status: 'passed', duration: 0 });
    }
  }
  return points.slice(0, 20);
}

function stabilityFromPoints(points: XReportTestHistoryPoint[], current?: TestStatus): number {
  const all = [...points];
  if (current) all.unshift({ date: Date.now(), status: current, duration: 0 });
  if (!all.length) return 100;
  const passed = all.filter((p) => p.status === 'passed').length;
  return Math.round((passed / all.length) * 100);
}

export function enrichTest(test: XReportTest, historyRecords: HistoryRecord[] = []): XReportTest {
  const msg = test.errors[0]?.message || test.attempts.find((a) => a.errors[0])?.errors[0]?.message;
  const stack = test.errors[0]?.stack || test.attempts.find((a) => a.errors[0])?.errors[0]?.stack;
  const signature = normalizeErrorSignature(msg);
  const clusterId =
    test.status === 'failed' || test.status === 'timedOut' ? errorSignatureHash(msg) : undefined;
  const meta = labelsFromAnnotations(test.annotations);
  const retries = Math.max(0, (test.attempts?.length || 1) - 1);
  const testHistory = historyForTest(test.historyId, historyRecords);
  const stabilityPct = stabilityFromPoints(testHistory, test.status);
  const failureCategory =
    test.status === 'failed' || test.status === 'timedOut' || test.flaky
      ? classifyFailure(msg, stack)
      : undefined;
  return {
    ...test,
    steps: markSlowSteps(test.steps || []),
    errorSignature: msg ? signature : undefined,
    clusterId,
    owner: test.owner || meta.owner,
    severity: test.severity || meta.severity,
    tags: mergeTags(test.tags || [], meta.annotationTags),
    labels: { ...meta.labels, ...(test.labels || {}) },
    retries: test.retries ?? retries,
    failureCategory: test.failureCategory || failureCategory,
    stabilityPct,
    testHistory,
  };
}

export function computeStabilityGrade(summary: XReportSummary, flakyRate: number): {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
} {
  const total = summary.total || 1;
  const failRate = ((summary.failed + summary.timedOut) / total) * 100;
  let score = 100 - failRate * 1.2 - flakyRate * 0.8;
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  score = Math.round(score);
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  return { grade, score };
}

export function enrichRun(
  run: XReportRun,
  previousFailedIds: string[] = [],
  previousSummary?: XReportSummary,
  historyTrend: XReportAnalytics['historyTrend'] = [],
  historyRecords: HistoryRecord[] = [],
): XReportRun {
  const walkSuites = (suites: typeof run.suites): typeof run.suites =>
    suites.map((s) => ({
      ...s,
      suites: walkSuites(s.suites),
      tests: s.tests.map((t) => {
        const enriched = enrichTest(t, historyRecords);
        const isFail = enriched.status === 'failed' || enriched.status === 'timedOut';
        return {
          ...enriched,
          regression:
            isFail && previousFailedIds.length > 0 && !previousFailedIds.includes(enriched.historyId),
        };
      }),
    }));

  const suites = walkSuites(run.suites);
  const withSuites = { ...run, suites };
  const coverage = mergeCoverage(withSuites);
  return {
    ...withSuites,
    coverageSummary: coverage || run.coverageSummary,
    analytics: buildAnalytics(
      withSuites,
      previousSummary,
      historyTrend,
      coverage || run.coverageSummary,
      historyRecords,
    ),
  };
}

function mergeCoverage(run: XReportRun): XReportCoverageSummary | undefined {
  if (run.coverageSummary) return run.coverageSummary;
  const tests = collectTests(run.suites);
  const withCov = tests.filter((t) => t.coverageSummary);
  if (!withCov.length) {
    for (const t of tests) {
      for (const a of t.attachments || []) {
        if (a.name === 'coverage.json' || a.type === 'json') {
          try {
            const body = a.body && !a.body.startsWith('data:') ? JSON.parse(a.body) : null;
            if (body && (body.lines != null || body.statements != null)) {
              return {
                lines: body.lines,
                statements: body.statements,
                branches: body.branches,
                functions: body.functions,
              };
            }
          } catch {
            // ignore
          }
        }
      }
    }
    return undefined;
  }
  const avg = (key: keyof XReportCoverageSummary) => {
    const vals = withCov.map((t) => t.coverageSummary![key]).filter((n): n is number => typeof n === 'number');
    if (!vals.length) return undefined;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };
  return {
    lines: avg('lines'),
    statements: avg('statements'),
    branches: avg('branches'),
    functions: avg('functions'),
  };
}

export function buildFailedRerun(run: XReportRun): XReportAnalytics['failedRerun'] {
  const failed = collectTests(run.suites).filter(
    (t) => t.status === 'failed' || t.status === 'timedOut',
  );
  if (!failed.length) return { command: '', files: [], count: 0 };
  const files = [
    ...new Set(
      failed.map((t) => {
        if (t.file && t.line) return `${t.file}:${t.line}`;
        return t.file || t.title;
      }),
    ),
  ];
  const framework = (run.framework || '').toLowerCase();
  let command = '';
  if (framework.includes('playwright')) {
    const specs = [...new Set(failed.map((t) => t.file).filter(Boolean))];
    command = specs.length
      ? `npx playwright test ${specs.map((f) => `"${f}"`).join(' ')}`
      : `npx playwright test --grep "${failed.map((t) => t.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}"`;
  } else if (framework.includes('cypress')) {
    const specs = [...new Set(failed.map((t) => t.file).filter(Boolean))];
    command = specs.length
      ? `npx cypress run --spec ${specs.map((f) => `"${f}"`).join(',')}`
      : `npx cypress run`;
  } else if (framework.includes('jest')) {
    const specs = [...new Set(failed.map((t) => t.file).filter(Boolean))];
    command = specs.length
      ? `npx jest ${specs.map((f) => `"${f}"`).join(' ')}`
      : `npx jest -t "${failed.map((t) => t.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}"`;
  } else if (framework.includes('vitest')) {
    const specs = [...new Set(failed.map((t) => t.file).filter(Boolean))];
    command = specs.length
      ? `npx vitest run ${specs.map((f) => `"${f}"`).join(' ')}`
      : `npx vitest run -t "${failed.map((t) => t.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}"`;
  } else if (framework.includes('wdio') || framework.includes('webdriver')) {
    command = `npx wdio run wdio.conf.js`;
  } else if (framework.includes('mocha')) {
    command = `npx mocha ${files.filter((f) => !f.includes(':')).map((f) => `"${f}"`).join(' ')}`;
  } else {
    command = `# Rerun ${failed.length} failed test(s)\n${files.map((f) => `# ${f}`).join('\n')}`;
  }
  return { command, files, count: failed.length };
}

export function buildAnalytics(
  run: XReportRun,
  previousSummary?: XReportSummary,
  historyTrend: XReportAnalytics['historyTrend'] = [],
  coverage?: XReportCoverageSummary,
  historyRecords: HistoryRecord[] = [],
): XReportAnalytics {
  const tests = collectTests(run.suites);
  const slowest = [...tests]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10)
    .map((t) => ({
      historyId: t.historyId,
      title: t.fullTitle || t.title,
      duration: t.duration,
      status: t.status,
    }));

  const fileMap = new Map<string, { total: number; passed: number; failed: number; flaky: number }>();
  for (const t of tests) {
    const file = t.file || '(unknown)';
    const row = fileMap.get(file) || { total: 0, passed: 0, failed: 0, flaky: 0 };
    row.total += 1;
    if (t.status === 'passed') row.passed += 1;
    if (t.status === 'failed' || t.status === 'timedOut') row.failed += 1;
    if (t.flaky) row.flaky += 1;
    fileMap.set(file, row);
  }
  const byFile = [...fileMap.entries()]
    .map(([file, v]) => ({ file, ...v }))
    .sort((a, b) => b.failed - a.failed || b.total - a.total);

  const tagMap = new Map<string, { total: number; passed: number; failed: number }>();
  for (const t of tests) {
    for (const raw of t.tags || []) {
      const tag = raw.startsWith('@') ? raw : `@${raw}`;
      const row = tagMap.get(tag) || { total: 0, passed: 0, failed: 0 };
      row.total += 1;
      if (t.status === 'passed') row.passed += 1;
      if (t.status === 'failed' || t.status === 'timedOut') row.failed += 1;
      tagMap.set(tag, row);
    }
  }
  const tagHealth = [...tagMap.entries()]
    .map(([tag, v]) => ({
      tag,
      ...v,
      passRate: v.total ? Math.round((v.passed / v.total) * 100) : 0,
    }))
    .sort((a, b) => a.passRate - b.passRate);

  const clusterMap = new Map<
    string,
    { signature: string; count: number; sample: string; testIds: string[]; category?: FailureCategory }
  >();
  for (const t of tests) {
    if (!t.clusterId) continue;
    const row = clusterMap.get(t.clusterId) || {
      signature: t.errorSignature || t.clusterId,
      count: 0,
      sample: t.errors[0]?.message || t.errorSignature || '',
      testIds: [],
      category: t.failureCategory,
    };
    row.count += 1;
    row.testIds.push(t.id);
    clusterMap.set(t.clusterId, row);
  }
  const clusters = [...clusterMap.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count);

  const regressions = tests
    .filter((t) => t.regression)
    .map((t) => ({ historyId: t.historyId, title: t.fullTitle || t.title }));

  const projectMap = new Map<
    string,
    { total: number; passed: number; failed: number; flaky: number; skipped: number }
  >();
  for (const t of tests) {
    const project = t.project || '(default)';
    const row = projectMap.get(project) || { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 };
    row.total += 1;
    if (t.status === 'passed') row.passed += 1;
    if (t.status === 'failed' || t.status === 'timedOut') row.failed += 1;
    if (t.status === 'skipped' || t.status === 'pending') row.skipped += 1;
    if (t.flaky) row.flaky += 1;
    projectMap.set(project, row);
  }
  const byProject = [...projectMap.entries()]
    .map(([project, v]) => ({ project, ...v }))
    .sort((a, b) => b.failed - a.failed || b.total - a.total);

  let delta: XReportAnalytics['delta'];
  if (previousSummary) {
    delta = {
      total: run.summary.total - previousSummary.total,
      passed: run.summary.passed - previousSummary.passed,
      failed: run.summary.failed + run.summary.timedOut - (previousSummary.failed + previousSummary.timedOut),
      flaky: run.summary.flaky - previousSummary.flaky,
      duration: run.summary.duration - previousSummary.duration,
    };
  }

  const flakyRate = run.summary.total ? (run.summary.flaky / run.summary.total) * 100 : 0;
  const { grade, score } = computeStabilityGrade(run.summary, flakyRate);

  const catMap = new Map<FailureCategory, number>();
  for (const t of tests) {
    if (!t.failureCategory) continue;
    catMap.set(t.failureCategory, (catMap.get(t.failureCategory) || 0) + 1);
  }
  const byCategory = [...catMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const quarantine = tests
    .filter((t) => {
      const pct = t.stabilityPct ?? 100;
      return t.flaky || pct < 80 || (t.testHistory || []).length >= 2 && pct < 90;
    })
    .map((t) => ({
      historyId: t.historyId,
      title: t.fullTitle || t.title,
      stabilityPct: t.stabilityPct ?? 100,
      category: t.failureCategory,
      reason:
        (t.stabilityPct ?? 100) < 70
          ? 'Low stability across runs'
          : t.flaky
            ? 'Flaky in this run'
            : 'Unstable across recent history',
    }))
    .sort((a, b) => a.stabilityPct - b.stabilityPct)
    .slice(0, 20);

  const envMap = new Map<string, { label: string; runs: number; passSum: number }>();
  for (const r of historyRecords) {
    const branch = (r.environment?.branch as string) || 'unknown';
    const browser = (r.environment?.browser as string) || '';
    const key = browser ? `${branch}·${browser}` : branch;
    const row = envMap.get(key) || { label: key, runs: 0, passSum: 0 };
    row.runs += 1;
    row.passSum += r.summary.total ? (r.summary.passed / r.summary.total) * 100 : 0;
    envMap.set(key, row);
  }
  // include current
  {
    const branch = (run.environment?.branch as string) || 'unknown';
    const browser = (run.environment?.browser as string) || '';
    const key = browser ? `${branch}·${browser}` : branch;
    const row = envMap.get(key) || { label: key, runs: 0, passSum: 0 };
    row.runs += 1;
    row.passSum += run.summary.total ? (run.summary.passed / run.summary.total) * 100 : 0;
    envMap.set(key, row);
  }
  const byEnvironment = [...envMap.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      runs: v.runs,
      passRate: Math.round(v.passSum / v.runs),
    }))
    .sort((a, b) => b.runs - a.runs);

  const historyRuns: XReportAnalytics['historyRuns'] = historyRecords.slice(0, 30).map((r) => ({
    id: r.id,
    date: r.date,
    title: r.title,
    framework: r.framework,
    summary: r.summary,
    branch: (r.environment?.branch as string) || undefined,
    env: (r.environment?.browser as string) || (r.environment?.ci ? 'CI' : 'Local'),
    passRate: r.summary.total ? Math.round((r.summary.passed / r.summary.total) * 100) : 0,
    tests: (r.tests || []).map((t, i) => ({
      id: t.historyId || `${r.id}-${i}`,
      historyId: t.historyId,
      title: t.title,
      status: t.status,
      duration: t.duration,
      flaky: false,
    })),
  }));

  // Prepend current run for Runs table
  historyRuns.unshift({
    id: 'current',
    date: run.finishedAt || Date.now(),
    title: run.title,
    framework: run.framework,
    summary: run.summary,
    branch: (run.environment?.branch as string) || undefined,
    env: (run.environment?.browser as string) || (run.environment?.ci ? 'CI' : 'Local'),
    passRate: run.summary.total ? Math.round((run.summary.passed / run.summary.total) * 100) : 0,
    tests: collectTests(run.suites).map((t) => ({
      id: t.id,
      historyId: t.historyId,
      title: t.title,
      status: t.status,
      duration: t.duration,
      flaky: !!t.flaky,
    })),
  });

  return {
    slowest,
    byFile,
    tagHealth,
    clusters,
    regressions,
    byProject,
    delta,
    stabilityGrade: grade,
    stabilityScore: score,
    historyTrend,
    coverage,
    byCategory,
    quarantine,
    byEnvironment,
    historyRuns,
    failedRerun: buildFailedRerun(run),
  };
}

export function historyTrendFromRecords(
  records: HistoryRecord[],
  limit = 12,
): XReportAnalytics['historyTrend'] {
  return records
    .slice(0, limit)
    .reverse()
    .map((r) => ({
      date: r.date,
      passRate: r.summary.total ? Math.round((r.summary.passed / r.summary.total) * 100) : 0,
      failed: r.summary.failed + r.summary.timedOut,
      total: r.summary.total,
      duration: r.summary.duration,
    }));
}

export function flakeStatsFromHistory(records: HistoryRecord[], limit = 40): Array<{
  historyId: string;
  title: string;
  runs: number;
  fails: number;
  stabilityPct: number;
}> {
  const map = new Map<string, { title: string; runs: number; fails: number }>();
  for (const r of records.slice(0, limit)) {
    if (r.tests?.length) {
      for (const t of r.tests) {
        const row = map.get(t.historyId) || { title: t.title, runs: 0, fails: 0 };
        row.runs += 1;
        if (t.status === 'failed' || t.status === 'timedOut') row.fails += 1;
        map.set(t.historyId, row);
      }
    } else {
      for (const id of r.failedIds) {
        const row = map.get(id) || { title: id, runs: 0, fails: 0 };
        row.runs += 1;
        row.fails += 1;
        map.set(id, row);
      }
      for (const id of r.passedIds) {
        const row = map.get(id) || { title: id, runs: 0, fails: 0 };
        row.runs += 1;
        map.set(id, row);
      }
    }
  }
  return [...map.entries()]
    .map(([historyId, v]) => ({
      historyId,
      title: v.title,
      runs: v.runs,
      fails: v.fails,
      stabilityPct: v.runs ? Math.round(((v.runs - v.fails) / v.runs) * 100) : 100,
    }))
    .filter((x) => x.fails > 0 && x.runs >= 2)
    .sort((a, b) => a.stabilityPct - b.stabilityPct);
}

export function failedHistoryIds(run: XReportRun): string[] {
  return collectTests(run.suites)
    .filter((t) => t.status === 'failed' || t.status === 'timedOut')
    .map((t) => t.historyId);
}

export function passedHistoryIds(run: XReportRun): string[] {
  return collectTests(run.suites)
    .filter((t) => t.status === 'passed')
    .map((t) => t.historyId);
}

export function statusPriority(s: TestStatus): number {
  if (s === 'failed' || s === 'timedOut') return 0;
  if (s === 'passed') return 2;
  return 3;
}
