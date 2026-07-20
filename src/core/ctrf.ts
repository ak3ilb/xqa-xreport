import type { XReportRun, XReportTest } from './types';
import { collectTests } from './utils';

/** Common Test Report Format (CTRF) — https://ctrf.io */
export interface CtrfReport {
  results: {
    tool: { name: string };
    summary: {
      tests: number;
      passed: number;
      failed: number;
      pending: number;
      skipped: number;
      other: number;
      start: number;
      stop: number;
    };
    tests: Array<{
      name: string;
      status: string;
      duration: number;
      message?: string;
      trace?: string;
      suite?: string;
      filePath?: string;
      retries?: number;
      flaky?: boolean;
      rawStatus?: string;
    }>;
    environment?: Record<string, string | boolean | undefined>;
  };
}

function mapStatus(t: XReportTest): string {
  if (t.status === 'timedOut') return 'failed';
  if (t.status === 'interrupted') return 'other';
  if (t.status === 'pending') return 'pending';
  return t.status;
}

export function toCtrf(run: XReportRun): CtrfReport {
  const tests = collectTests(run.suites);
  let other = 0;
  const mapped = tests.map((t) => {
    const status = mapStatus(t);
    if (status === 'other') other += 1;
    return {
      name: t.fullTitle || t.title,
      status,
      duration: t.duration,
      message: t.errors[0]?.message,
      trace: t.errors[0]?.stack,
      suite: t.fullTitle?.includes(' › ')
        ? t.fullTitle.split(' › ').slice(0, -1).join(' › ')
        : undefined,
      filePath: t.file,
      retries: Math.max(0, t.attempts.length - 1),
      flaky: t.flaky,
      rawStatus: t.status,
    };
  });

  return {
    results: {
      tool: { name: 'xreport' },
      summary: {
        tests: run.summary.total,
        passed: run.summary.passed,
        failed: run.summary.failed + run.summary.timedOut,
        pending: run.summary.pending,
        skipped: run.summary.skipped,
        other,
        start: run.startedAt,
        stop: run.finishedAt,
      },
      tests: mapped,
      environment: {
        ...run.environment,
        appName: run.branding.projectName,
        reportBrand: 'XREPORT by XQA',
        reportWebsite: run.brand.website,
      },
    },
  };
}
