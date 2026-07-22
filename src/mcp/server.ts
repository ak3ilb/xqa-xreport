#!/usr/bin/env node
/**
 * Minimal stdio MCP server for local XREPORT data (no cloud account).
 * Protocol: JSON-RPC 2.0 over stdin/stdout (MCP subset for tools/list + tools/call).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { buildAiContextPack } from '../core/ai-context';
import { loadHistory, resolveHistoryPath } from '../core/history';
import type { XReportRun } from '../core/types';
import { XREPORT_VERSION } from '../core/types';
import { collectTests } from '../core/utils';

type Json = Record<string, unknown>;

function findReportDir(cwd = process.cwd()): string {
  const env = process.env.XREPORT_DIR || process.env.XREPORT_REPORT_DIR;
  if (env && fs.existsSync(env)) return path.resolve(env);
  const candidates = [
    path.join(cwd, 'xreport'),
    path.join(cwd, 'examples/sample-report'),
    cwd,
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'xreport.json'))) return c;
  }
  return path.join(cwd, 'xreport');
}

function readRun(reportDir: string): XReportRun | null {
  const p = path.join(reportDir, 'xreport.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as XReportRun;
}

function ok(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function err(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function textContent(text: string) {
  return { content: [{ type: 'text', text }] };
}

const TOOLS = [
  {
    name: 'xreport_last_run',
    description: 'Summary of the latest local XREPORT run (xreport.json)',
    inputSchema: { type: 'object', properties: { reportDir: { type: 'string' } } },
  },
  {
    name: 'xreport_list_runs',
    description: 'List recent runs from local .xreport/history.json',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        dbPath: { type: 'string' },
      },
    },
  },
  {
    name: 'xreport_failures',
    description: 'List failed tests from the latest report',
    inputSchema: { type: 'object', properties: { reportDir: { type: 'string' } } },
  },
  {
    name: 'xreport_clusters',
    description: 'Error clusters from the latest report analytics',
    inputSchema: { type: 'object', properties: { reportDir: { type: 'string' } } },
  },
  {
    name: 'xreport_test_history',
    description: 'History points for a test historyId from local history DB',
    inputSchema: {
      type: 'object',
      properties: {
        historyId: { type: 'string' },
        limit: { type: 'number' },
        dbPath: { type: 'string' },
      },
      required: ['historyId'],
    },
  },
  {
    name: 'xreport_get_context',
    description:
      'AI context pack / agent prompt for the latest report (or a single test by id)',
    inputSchema: {
      type: 'object',
      properties: {
        reportDir: { type: 'string' },
        testId: { type: 'string' },
      },
    },
  },
  {
    name: 'xreport_flaky_top',
    description: 'Top flaky / quarantine tips from the latest report',
    inputSchema: { type: 'object', properties: { reportDir: { type: 'string' }, limit: { type: 'number' } } },
  },
  {
    name: 'xreport_gate_status',
    description: 'Quality gate result from gate-result.json or embedded run.gateResult',
    inputSchema: { type: 'object', properties: { reportDir: { type: 'string' } } },
  },
  {
    name: 'xreport_known_issues',
    description: 'Muted / known-issue matches from the latest report',
    inputSchema: { type: 'object', properties: { reportDir: { type: 'string' } } },
  },
];

function handleTool(name: string, args: Json): ReturnType<typeof textContent> {
  const reportDir = path.resolve(String(args.reportDir || findReportDir()));
  const run = readRun(reportDir);

  if (name === 'xreport_list_runs') {
    const dbPath = resolveHistoryPath(args.dbPath ? { dbPath: String(args.dbPath) } : undefined);
    const limit = Math.min(50, Number(args.limit) || 20);
    const hist = loadHistory(dbPath);
    const rows = [...hist.records]
      .sort((a, b) => b.date - a.date)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        date: new Date(r.date).toISOString(),
        title: r.title,
        framework: r.framework,
        summary: r.summary,
        branch: r.environment?.branch,
      }));
    return textContent(JSON.stringify({ dbPath, runs: rows }, null, 2));
  }

  if (name === 'xreport_test_history') {
    const historyId = String(args.historyId || '');
    const limit = Math.min(50, Number(args.limit) || 20);
    const dbPath = resolveHistoryPath(args.dbPath ? { dbPath: String(args.dbPath) } : undefined);
    const hist = loadHistory(dbPath);
    const points: Array<{ date: string; status: string; duration: number; title: string }> = [];
    for (const rec of [...hist.records].sort((a, b) => b.date - a.date)) {
      const t = (rec.tests || []).find((x) => x.historyId === historyId);
      if (!t) continue;
      points.push({
        date: new Date(rec.date).toISOString(),
        status: t.status,
        duration: t.duration,
        title: t.title,
      });
      if (points.length >= limit) break;
    }
    return textContent(JSON.stringify({ historyId, points }, null, 2));
  }

  if (!run) {
    return textContent(
      JSON.stringify({
        error: `No xreport.json in ${reportDir}. Set XREPORT_DIR or pass reportDir.`,
      }),
    );
  }

  if (name === 'xreport_last_run') {
    return textContent(
      JSON.stringify(
        {
          reportDir,
          title: run.title,
          framework: run.framework,
          summary: run.summary,
          stabilityGrade: run.analytics?.stabilityGrade,
          clusters: run.analytics?.clusters?.length || 0,
          aiInsights: run.aiInsights?.length || 0,
        },
        null,
        2,
      ),
    );
  }

  if (name === 'xreport_failures') {
    const fails = collectTests(run.suites)
      .filter((t) => t.status === 'failed' || t.status === 'timedOut')
      .map((t) => ({
        id: t.id,
        title: t.fullTitle,
        file: t.file,
        line: t.line,
        category: t.failureCategory,
        defectKind: t.defectKind,
        clusterId: t.clusterId,
        message: t.errors[0]?.message,
      }));
    return textContent(JSON.stringify({ reportDir, failures: fails }, null, 2));
  }

  if (name === 'xreport_clusters') {
    return textContent(
      JSON.stringify({ reportDir, clusters: run.analytics?.clusters || [] }, null, 2),
    );
  }

  if (name === 'xreport_get_context') {
    const pack = buildAiContextPack(run);
    const testId = args.testId ? String(args.testId) : '';
    if (testId) {
      const t = collectTests(run.suites).find((x) => x.id === testId || x.historyId === testId);
      if (!t) return textContent(JSON.stringify({ error: `Test not found: ${testId}` }));
      const { buildSingleTestPrompt } = require('../core/ai-context') as typeof import('../core/ai-context');
      return textContent(buildSingleTestPrompt(t));
    }
    return textContent(pack.agentPrompt);
  }

  if (name === 'xreport_flaky_top') {
    const limit = Math.min(50, Number(args.limit) || 15);
    return textContent(
      JSON.stringify(
        {
          quarantine: (run.analytics?.quarantine || []).slice(0, limit),
          flaky: collectTests(run.suites)
            .filter((t) => t.flaky)
            .slice(0, limit)
            .map((t) => ({
              id: t.id,
              title: t.fullTitle,
              stabilityPct: t.stabilityPct,
              category: t.failureCategory,
              defectKind: t.defectKind,
            })),
        },
        null,
        2,
      ),
    );
  }

  if (name === 'xreport_gate_status') {
    const gatePath = path.join(reportDir, 'gate-result.json');
    let gate = run.gateResult || null;
    if (!gate && fs.existsSync(gatePath)) {
      gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
    }
    return textContent(JSON.stringify({ reportDir, gate }, null, 2));
  }

  if (name === 'xreport_known_issues') {
    const matches = collectTests(run.suites)
      .filter((t) => t.muted || t.knownIssueId)
      .map((t) => ({
        id: t.id,
        historyId: t.historyId,
        title: t.fullTitle,
        muted: !!t.muted,
        knownIssueId: t.knownIssueId,
        knownIssueReason: t.knownIssueReason,
        clusterId: t.clusterId,
        status: t.status,
      }));
    return textContent(JSON.stringify({ reportDir, matches }, null, 2));
  }

  return textContent(JSON.stringify({ error: `Unknown tool: ${name}` }));
}

async function handle(msg: Json): Promise<Json> {
  const method = String(msg.method || '');
  const id = msg.id;

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'xreport-mcp', version: XREPORT_VERSION },
    });
  }
  if (method === 'notifications/initialized' || method === 'initialized') {
    return ok(id, {});
  }
  if (method === 'tools/list') {
    return ok(id, { tools: TOOLS });
  }
  if (method === 'tools/call') {
    const params = (msg.params || {}) as Json;
    const name = String(params.name || '');
    const args = (params.arguments || {}) as Json;
    try {
      return ok(id, handleTool(name, args));
    } catch (e) {
      return err(id, -32000, e instanceof Error ? e.message : String(e));
    }
  }
  if (method === 'ping') return ok(id, {});

  return err(id, -32601, `Method not found: ${method}`);
}

export async function runMcpServer(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg: Json;
    try {
      msg = JSON.parse(trimmed) as Json;
    } catch {
      continue;
    }
    // Notifications have no id — still may need handling without reply for some; skip reply if no id
    if (msg.method && msg.id === undefined && String(msg.method).startsWith('notifications/')) {
      continue;
    }
    const response = await handle(msg);
    if (msg.id !== undefined) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  }
}

if (require.main === module) {
  void runMcpServer();
}
