import * as fs from 'fs';
import * as path from 'path';
import type { HistoryRecord, XReportHistoryOptions, XReportRun } from './types';
import { createId, ensureDir, readJson, writeJson } from './utils';
import { failedHistoryIds, passedHistoryIds } from './analytics';
import { collectTests } from './utils';

export interface HistoryStore {
  version: number;
  records: HistoryRecord[];
}

const DEFAULT_DB = './.xreport/history.json';

export function resolveHistoryPath(options?: XReportHistoryOptions): string {
  return path.resolve(options?.dbPath || DEFAULT_DB);
}

export function loadHistory(dbPath: string): HistoryStore {
  if (!fs.existsSync(dbPath)) return { version: 1, records: [] };
  try {
    const data = readJson<HistoryStore>(dbPath);
    if (!data.records) return { version: 1, records: [] };
    return data;
  } catch {
    return { version: 1, records: [] };
  }
}

export function saveHistory(dbPath: string, store: HistoryStore): void {
  ensureDir(path.dirname(dbPath));
  writeJson(dbPath, store);
}

export function cleanupHistory(
  store: HistoryStore,
  options: XReportHistoryOptions = {},
): HistoryStore {
  const max = options.maxRecords ?? 100;
  const days = options.retentionDays ?? 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let records = store.records.filter((r) => r.date >= cutoff);
  records.sort((a, b) => b.date - a.date);
  if (records.length > max) records = records.slice(0, max);
  return { version: 1, records };
}

export function appendHistory(
  run: XReportRun,
  options: XReportHistoryOptions = {},
): HistoryStore {
  const dbPath = resolveHistoryPath(options);
  let store = loadHistory(dbPath);
  const record: HistoryRecord = {
    id: createId('run'),
    date: run.finishedAt || Date.now(),
    framework: run.framework,
    title: run.title,
    summary: run.summary,
    environment: run.environment,
    failedIds: failedHistoryIds(run),
    passedIds: passedHistoryIds(run),
    tests: options.saveFullResults
      ? collectTests(run.suites).map((t) => ({
          historyId: t.historyId,
          title: t.fullTitle || t.title,
          status: t.status,
          duration: t.duration,
        }))
      : undefined,
  };
  store.records.unshift(record);
  if (options.autoCleanup !== false) store = cleanupHistory(store, options);
  saveHistory(dbPath, store);
  return store;
}

export function lastFailedIds(options?: XReportHistoryOptions): string[] {
  const store = loadHistory(resolveHistoryPath(options));
  return store.records[0]?.failedIds || [];
}

export function lastHistoryRecord(options?: XReportHistoryOptions): HistoryRecord | undefined {
  const store = loadHistory(resolveHistoryPath(options));
  return store.records[0];
}

export function recentHistoryRecords(limit = 12, options?: XReportHistoryOptions): HistoryRecord[] {
  return loadHistory(resolveHistoryPath(options)).records.slice(0, limit);
}

export function listHistory(limit = 20, options?: XReportHistoryOptions): HistoryRecord[] {
  const store = loadHistory(resolveHistoryPath(options));
  return store.records.slice(0, limit);
}

export function historyStats(options?: XReportHistoryOptions): {
  runs: number;
  avgPassRate: number;
  avgDuration: number;
  totalTests: number;
} {
  const records = loadHistory(resolveHistoryPath(options)).records;
  if (!records.length) return { runs: 0, avgPassRate: 0, avgDuration: 0, totalTests: 0 };
  let passSum = 0;
  let durSum = 0;
  let tests = 0;
  for (const r of records) {
    const total = r.summary.total || 0;
    tests += total;
    passSum += total ? (r.summary.passed / total) * 100 : 0;
    durSum += r.summary.duration || 0;
  }
  return {
    runs: records.length,
    avgPassRate: Math.round(passSum / records.length),
    avgDuration: Math.round(durSum / records.length),
    totalTests: tests,
  };
}

export function historyTrends(days = 30, options?: XReportHistoryOptions): Array<{
  date: string;
  runs: number;
  tests: number;
  passRate: number;
  avgDuration: number;
}> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const records = loadHistory(resolveHistoryPath(options)).records.filter((r) => r.date >= cutoff);
  const byDay = new Map<string, { runs: number; tests: number; passSum: number; durSum: number }>();
  for (const r of records) {
    const date = new Date(r.date).toISOString().slice(0, 10);
    const row = byDay.get(date) || { runs: 0, tests: 0, passSum: 0, durSum: 0 };
    row.runs += 1;
    row.tests += r.summary.total;
    row.passSum += r.summary.total ? (r.summary.passed / r.summary.total) * 100 : 0;
    row.durSum += r.summary.duration;
    byDay.set(date, row);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, v]) => ({
      date,
      runs: v.runs,
      tests: v.tests,
      passRate: Math.round(v.passSum / v.runs),
      avgDuration: Math.round(v.durSum / v.runs),
    }));
}

export function deleteOlderThan(days: number, options?: XReportHistoryOptions): number {
  const dbPath = resolveHistoryPath(options);
  const store = loadHistory(dbPath);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const before = store.records.length;
  store.records = store.records.filter((r) => r.date >= cutoff);
  saveHistory(dbPath, store);
  return before - store.records.length;
}

export function exportHistory(outPath: string, options?: XReportHistoryOptions): void {
  const store = loadHistory(resolveHistoryPath(options));
  writeJson(path.resolve(outPath), store);
}

export function importHistory(inPath: string, options?: XReportHistoryOptions): number {
  const incoming = readJson<HistoryStore>(path.resolve(inPath));
  const dbPath = resolveHistoryPath(options);
  const store = loadHistory(dbPath);
  const ids = new Set(store.records.map((r) => r.id));
  let added = 0;
  for (const r of incoming.records || []) {
    if (!ids.has(r.id)) {
      store.records.push(r);
      added += 1;
    }
  }
  store.records.sort((a, b) => b.date - a.date);
  saveHistory(dbPath, cleanupHistory(store, options));
  return added;
}
