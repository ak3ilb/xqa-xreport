import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import {
  cleanupHistory,
  deleteOlderThan,
  exportHistory,
  historyStats,
  historyTrends,
  importHistory,
  listHistory,
  loadHistory,
  resolveHistoryPath,
  saveHistory,
} from '../core/history';
import { analyzeRunWithAi, isAiConfigured } from '../core/ai-analyze';
import { writeAiContextPack } from '../core/ai-context';
import { flakeStatsFromHistory } from '../core/analytics';
import { applyKnownIssues, listKnownIssueMatches } from '../core/known-issues';
import { buildQuarantineExport, evaluateQualityGate } from '../core/quality-gate';
import { generateReport, mergeRuns } from '../generator';
import type { XReportAiOptions, XReportRun } from '../core/types';
import { formatDuration, readJson, writeJson } from '../core/utils';
import { runMcpServer } from '../mcp/server';

function help(): void {
  console.log(`
XREPORT by XQA  ·  https://xqa.io

Usage:
  xreport generate <xreport.json> [-o <dir>]
  xreport open [dir] [--port 4173]
  xreport merge <dir-or-files...> [-o <dir>]
  xreport view [port]
  xreport ai context [dir]
  xreport ai analyze [dir]
  xreport gate [dir] [--max-failed=N] [--max-new=N] [--max-product=N] [--max-clusters=N] [--fail-unknown]
  xreport quarantine export [dir] [-o file]
  xreport mcp
  xreport history list [n]
  xreport history stats
  xreport history trends [days]
  xreport history flakes
  xreport history failed-rerun [xreport.json]
  xreport history delete --days=N
  xreport history cleanup --max=N
  xreport history export <file>
  xreport history import <file>

Commands:
  generate   Build HTML/CSV/CTRF from an XReport JSON file
  open       Serve a report folder locally (needed for embedded trace viewer)
  merge      Merge multiple xreport.json partials (Playwright shards / WDIO workers)
  view       Open interactive JSON drag-drop viewer
  ai         Local-first AI context pack / optional LLM analyze
  gate       Quality gate exit codes from xreport.json (muted known issues ignored by default)
  quarantine Export quarantine / muted tips for CI skip lists
  mcp        Start local MCP server (stdio) for Cursor / agents
  history    Local run history (list/stats/trends/flakes/failed-rerun/...)

Practice: https://xqa.io/practice
`);
}

function resolveReportDir(arg?: string): string {
  const dir = path.resolve(arg || './xreport');
  const jsonPath = path.join(dir, 'xreport.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`Missing ${jsonPath}`);
    process.exit(1);
  }
  return dir;
}

function aiOptionsFromEnv(): XReportAiOptions {
  return {
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: process.env.XREPORT_AI_BASE_URL,
    apiKey: process.env.XREPORT_AI_API_KEY,
    model: process.env.XREPORT_AI_MODEL,
  };
}

async function cmdAi(args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === 'context') {
    const dir = resolveReportDir(args[1]);
    const run = readJson<XReportRun>(path.join(dir, 'xreport.json'));
    const packed = writeAiContextPack(dir, run);
    console.log(`\n  AI context written:\n  ${packed.mdPath}\n  ${packed.jsonPath}\n`);
    return;
  }
  if (sub === 'analyze') {
    const dir = resolveReportDir(args[1]);
    const jsonPath = path.join(dir, 'xreport.json');
    const run = readJson<XReportRun>(jsonPath);
    const opts = { ...aiOptionsFromEnv(), ...(run.options?.ai || {}) };
    opts.enabled = true;
    if (!isAiConfigured(opts)) {
      console.error(
        'AI not configured. Set XREPORT_AI_BASE_URL (e.g. http://127.0.0.1:11434/v1 for Ollama)\n' +
          'and XREPORT_AI_API_KEY for cloud providers.',
      );
      process.exit(1);
    }
    const insights = await analyzeRunWithAi(run, dir, opts);
    const withAi = { ...run, aiInsights: insights };
    writeJson(jsonPath, withAi);
    const packed = writeAiContextPack(dir, withAi);
    console.log(
      `\n  AI analyze: ${insights.length} insight(s)\n  ${jsonPath}\n  ${packed.mdPath}\n`,
    );
    return;
  }
  console.error('Usage: xreport ai context [dir] | xreport ai analyze [dir]');
  process.exit(1);
}

function cmdGate(args: string[]): void {
  const dirArg = args.find((a) => !a.startsWith('-'));
  const dir = resolveReportDir(dirArg);
  let run = readJson<XReportRun>(path.join(dir, 'xreport.json'));
  run = applyKnownIssues(run, run.options?.knownIssuesPath);
  const num = (flag: string) => {
    const hit = args.find((a) => a.startsWith(flag + '='));
    return hit ? Number(hit.split('=')[1]) : undefined;
  };
  const result = evaluateQualityGate(run, {
    maxFailed: num('--max-failed'),
    maxNewFailures: num('--max-new'),
    maxProductDefects: num('--max-product'),
    maxClusters: num('--max-clusters'),
    failOnUnknownDefect: args.includes('--fail-unknown'),
    ignoreMuted: !args.includes('--count-muted'),
  });
  console.log('\nXREPORT quality gate');
  console.log(
    `  failed=${result.counts.failed} muted=${result.counts.mutedFailed} new=${result.counts.newFailures} product=${result.counts.productDefects} clusters=${result.counts.clusters}`,
  );
  if (result.violations.length) {
    for (const v of result.violations) console.log(`  FAIL: ${v}`);
  } else {
    console.log('  OK');
  }
  console.log('');
  const matches = listKnownIssueMatches(run);
  if (matches.length) {
    console.log(`  Known issues matched: ${matches.length}`);
    for (const m of matches.slice(0, 10)) {
      console.log(`    ${m.ruleId}${m.muted ? ' (muted)' : ''} — ${m.fullTitle}`);
    }
    console.log('');
  }
  process.exit(result.exitCode);
}

function cmdQuarantine(args: string[]): void {
  if (args[0] !== 'export') {
    console.error('Usage: xreport quarantine export [dir] [-o file]');
    process.exit(1);
  }
  const dirArg = args.slice(1).find((a) => !a.startsWith('-'));
  const dir = resolveReportDir(dirArg);
  const outIdx = args.indexOf('-o');
  const out = outIdx >= 0 ? args[outIdx + 1] : path.join(dir, 'quarantine.txt');
  let run = readJson<XReportRun>(path.join(dir, 'xreport.json'));
  run = applyKnownIssues(run, run.options?.knownIssuesPath);
  const { lines, commandHint } = buildQuarantineExport(run);
  fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
  console.log(`\n  Wrote ${out}\n  ${commandHint}\n`);
}

function pad(s: string, n: number): string {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

async function cmdGenerate(args: string[]): Promise<void> {
  const file = args.find((a) => !a.startsWith('-'));
  if (!file) {
    console.error('Missing path to xreport.json');
    process.exit(1);
  }
  const outIdx = args.indexOf('-o');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.dirname(path.resolve(file));
  const run = readJson<XReportRun>(path.resolve(file));
  await generateReport(run, {
    reportDir: outDir,
    autoOpen: !process.env.CI,
    exportCSV: true,
    exportCtrf: true,
    enableHistory: true,
  });
}

async function cmdOpen(args: string[]): Promise<void> {
  const dirArg = args.find((a) => !a.startsWith('-') && a !== 'open');
  const dir = path.resolve(dirArg || './xreport');
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 4173;
  await serveStatic(dir, port, true);
}

async function cmdView(args: string[]): Promise<void> {
  const port = Number(args.find((a) => /^\d+$/.test(a))) || 4174;
  const candidates = [
    path.join(__dirname, '../../viewer-dist'),
    path.join(__dirname, '../../../viewer-dist'),
    path.resolve(process.cwd(), 'viewer-dist'),
  ];
  const dir = candidates.find((d) => fs.existsSync(path.join(d, 'index.html')));
  if (!dir) {
    console.error('viewer-dist not found. Reinstall @xqa.io/xreport.');
    process.exit(1);
  }
  await serveStatic(dir, port, true);
}

async function serveStatic(dir: string, port: number, openBrowser: boolean): Promise<void> {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(dir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.map': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.webm': 'video/webm',
      '.mp4': 'video/mp4',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));
  const url = `http://127.0.0.1:${port}`;
  console.log(`\n  XREPORT · serving ${dir}\n  ${url}\n  by XQA · https://xqa.io\n`);
  if (openBrowser) {
    try {
      const open = require('open') as (t: string) => Promise<unknown>;
      await open(url);
    } catch {
      // ignore
    }
  }
}

async function cmdMerge(args: string[]): Promise<void> {
  const outIdx = args.indexOf('-o');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : './xreport';
  const inputs = args.filter((a, i) => !a.startsWith('-') && a !== 'merge' && i !== outIdx + 1);
  const files: string[] = [];
  for (const input of inputs) {
    const p = path.resolve(input);
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        if (f.endsWith('.json')) files.push(path.join(p, f));
      }
    } else files.push(p);
  }
  if (!files.length) {
    console.error('No JSON files found to merge');
    process.exit(1);
  }
  const runs = files.map((f) => readJson<XReportRun>(f));
  const merged = mergeRuns(runs);
  await generateReport(merged, {
    reportDir: outDir,
    autoOpen: !process.env.CI,
    exportCSV: true,
    exportCtrf: true,
  });
}

function cmdHistory(args: string[]): void {
  const sub = args[0] || 'list';
  if (sub === 'list') {
    const n = Number(args[1]) || 20;
    const rows = listHistory(n);
    console.log('\nXREPORT History\n');
    console.log(
      `${pad('Date', 22)}${pad('Framework', 12)}${pad('Tests', 8)}${pad('Pass%', 8)}Duration`,
    );
    console.log('-'.repeat(60));
    for (const r of rows) {
      const pass = r.summary.total
        ? Math.round((r.summary.passed / r.summary.total) * 100)
        : 0;
      console.log(
        `${pad(new Date(r.date).toLocaleString(), 22)}${pad(r.framework, 12)}${pad(String(r.summary.total), 8)}${pad(pass.toFixed(1) + '%', 8)}${formatDuration(r.summary.duration)}`,
      );
    }
    console.log('');
    return;
  }
  if (sub === 'stats') {
    const s = historyStats();
    console.log('\nXREPORT History Stats');
    console.log(`  Runs:          ${s.runs}`);
    console.log(`  Avg pass rate: ${s.avgPassRate}%`);
    console.log(`  Avg duration:  ${formatDuration(s.avgDuration)}`);
    console.log(`  Total tests:   ${s.totalTests}\n`);
    return;
  }
  if (sub === 'trends') {
    const days = Number(args[1]) || 30;
    const rows = historyTrends(days);
    console.log(`\nTrends (Last ${days} days)\n`);
    console.log(
      `${pad('Date', 14)}${pad('Runs', 8)}${pad('Tests', 8)}${pad('Pass%', 8)}Avg Duration`,
    );
    console.log('-'.repeat(56));
    for (const r of rows) {
      console.log(
        `${pad(r.date, 14)}${pad(String(r.runs), 8)}${pad(String(r.tests), 8)}${pad(r.passRate.toFixed(1) + '%', 8)}${formatDuration(r.avgDuration)}`,
      );
    }
    console.log('');
    return;
  }
  if (sub === 'flakes') {
    const store = loadHistory(resolveHistoryPath());
    const rows = flakeStatsFromHistory(store.records);
    console.log('\nXREPORT Flaky / Unstable Tests\n');
    console.log(`${pad('Stability', 12)}${pad('Fails', 8)}${pad('Runs', 8)}Test`);
    console.log('-'.repeat(72));
    for (const r of rows.slice(0, 40)) {
      console.log(
        `${pad(r.stabilityPct + '%', 12)}${pad(String(r.fails), 8)}${pad(String(r.runs), 8)}${r.title}`,
      );
    }
    if (!rows.length) console.log('(none — need history with overlapping tests)');
    console.log('');
    return;
  }
  if (sub === 'failed-rerun') {
    const file = args[1] || './xreport/xreport.json';
    const p = path.resolve(file);
    if (!fs.existsSync(p)) {
      const alt = path.resolve('./examples/sample-report/xreport.json');
      if (!fs.existsSync(alt)) {
        console.error(`Missing report JSON: ${p}`);
        process.exit(1);
      }
      const run = readJson<XReportRun>(alt);
      printFailedRerun(run);
      return;
    }
    printFailedRerun(readJson<XReportRun>(p));
    return;
  }
  if (sub === 'delete') {
    const daysArg = args.find((a) => a.startsWith('--days='));
    const days = daysArg ? Number(daysArg.split('=')[1]) : 60;
    const n = deleteOlderThan(days);
    console.log(`Deleted ${n} records older than ${days} days.`);
    return;
  }
  if (sub === 'cleanup') {
    const maxArg = args.find((a) => a.startsWith('--max='));
    const max = maxArg ? Number(maxArg.split('=')[1]) : 50;
    const dbPath = resolveHistoryPath();
    const cleaned = cleanupHistory(loadHistory(dbPath), { maxRecords: max, retentionDays: 3650 });
    saveHistory(dbPath, cleaned);
    console.log(`History trimmed to ${cleaned.records.length} records (max ${max}).`);
    return;
  }
  if (sub === 'export') {
    const file = args[1];
    if (!file) {
      console.error('Usage: xreport history export <file>');
      process.exit(1);
    }
    exportHistory(file);
    console.log(`Exported history to ${file}`);
    return;
  }
  if (sub === 'import') {
    const file = args[1];
    if (!file) {
      console.error('Usage: xreport history import <file>');
      process.exit(1);
    }
    const n = importHistory(file);
    console.log(`Imported ${n} new records from ${file}`);
    return;
  }
  console.error(`Unknown history command: ${sub}`);
  help();
  process.exit(1);
}

function printFailedRerun(run: XReportRun): void {
  const cmd = run.analytics?.failedRerun?.command;
  const files = run.analytics?.failedRerun?.files || [];
  const count = run.analytics?.failedRerun?.count || 0;
  console.log(`\nFailed tests: ${count}`);
  if (cmd) console.log(`\n${cmd}\n`);
  for (const f of files) console.log(`  ${f}`);
  console.log('');
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const cmd = argv[0];
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    help();
    return;
  }
  if (cmd === 'generate') return cmdGenerate(argv.slice(1));
  if (cmd === 'open') return cmdOpen(argv.slice(1));
  if (cmd === 'merge') return cmdMerge(argv.slice(1));
  if (cmd === 'view') return cmdView(argv.slice(1));
  if (cmd === 'ai') return cmdAi(argv.slice(1));
  if (cmd === 'gate') {
    cmdGate(argv.slice(1));
    return;
  }
  if (cmd === 'quarantine') {
    cmdQuarantine(argv.slice(1));
    return;
  }
  if (cmd === 'mcp') return runMcpServer();
  if (cmd === 'history') {
    cmdHistory(argv.slice(1));
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  help();
  process.exit(1);
}

if (require.main === module) {
  void runCli();
}
