import type { XReportRun } from './types';
import { collectTests } from './utils';

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Flatten run to CSV for Excel / Google Sheets */
export function toCsv(run: XReportRun): string {
  const headers = [
    'suite',
    'title',
    'fullTitle',
    'status',
    'flaky',
    'durationMs',
    'file',
    'error',
    'attempts',
    'tags',
  ];
  const rows = [headers.join(',')];
  for (const t of collectTests(run.suites)) {
    const suite = t.fullTitle.includes(' › ')
      ? t.fullTitle.split(' › ').slice(0, -1).join(' › ')
      : '';
    rows.push(
      [
        escapeCsv(suite),
        escapeCsv(t.title),
        escapeCsv(t.fullTitle),
        t.status,
        String(t.flaky),
        String(t.duration),
        escapeCsv(t.file || ''),
        escapeCsv(t.errors[0]?.message || ''),
        String(t.attempts.length),
        escapeCsv(t.tags.join(' ')),
      ].join(','),
    );
  }
  return rows.join('\n') + '\n';
}
