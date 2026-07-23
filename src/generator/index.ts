import * as fs from 'fs';
import * as path from 'path';
import { analyzeRunWithAi, isAiConfigured } from '../core/ai-analyze';
import { writeAiContextPack } from '../core/ai-context';
import { enrichRun, historyTrendFromRecords } from '../core/analytics';
import { toCtrf } from '../core/ctrf';
import { toCsv } from '../core/csv';
import {
  appendHistory,
  lastFailedIds,
  lastHistoryRecord,
  recentHistoryRecords,
} from '../core/history';
import { applyKnownIssues } from '../core/known-issues';
import { copyTraceViewerAssets, writeFailedRerunArtifact } from '../core/trace';
import type { XReportOptions, XReportRun, XReportTest } from '../core/types';
import {
  ensureDir,
  mergeOptions,
  resolveFilename,
  summarize,
  writeJson,
} from '../core/utils';
import { applyPrivacyScrub } from '../core/privacy-scrub';
import { buildEvidencePack } from '../core/evidence-pack';
import { evaluateQualityGate } from '../core/quality-gate';
import { evaluateReadiness } from '../core/readiness';
import { renderHtml } from './html';

export interface GenerateResult {
  reportDir: string;
  htmlPath?: string;
  jsonPath?: string;
  csvPath?: string;
  ctrfPath?: string;
  pdfPath?: string;
  failedRerunPath?: string;
  traceViewerPath?: string;
  aiContextJsonPath?: string;
  aiContextMdPath?: string;
  evidenceZipPath?: string;
  evidenceManifestPath?: string;
}

export async function generateReport(
  run: XReportRun,
  options: XReportOptions = {},
): Promise<GenerateResult> {
  const opts = mergeOptions({ ...run.options, ...options });
  const reportDir = path.resolve(opts.reportDir);
  ensureDir(reportDir);

  const historyOn = !!(opts.enableHistory || opts.historyOptions?.enabled);
  const prevFailed = historyOn ? lastFailedIds(opts.historyOptions) : [];
  const prevRecord = historyOn ? lastHistoryRecord(opts.historyOptions) : undefined;
  const historyRecords = historyOn ? recentHistoryRecords(30, opts.historyOptions) : [];
  const trend = historyOn ? historyTrendFromRecords(historyRecords, 12) : [];
  const enriched = enrichRun(
    { ...run, options: opts },
    prevFailed,
    prevRecord?.summary,
    trend,
    historyRecords,
  );
  const withKnown = applyKnownIssues(enriched, opts.knownIssuesPath);
  const withPrivacy = applyPrivacyScrub(withKnown, opts.privacy || withKnown.options?.privacy);

  let gateResult;
  if (opts.qualityGate) {
    gateResult = evaluateQualityGate(withPrivacy, opts.qualityGate);
    writeJson(path.join(reportDir, 'gate-result.json'), gateResult);
  }

  const readinessCfg = opts.readiness || withPrivacy.options?.readiness;
  let withEnterprise: XReportRun = {
    ...withPrivacy,
    ...(gateResult ? { gateResult } : {}),
  };
  if (readinessCfg) {
    withEnterprise = {
      ...withEnterprise,
      readiness: evaluateReadiness(withEnterprise, {
        checklist: readinessCfg,
        gate: gateResult,
        reportDir,
      }),
    };
  }

  if (opts.enableHistory) {
    appendHistory(withEnterprise, opts.historyOptions);
  }

  const status =
    withEnterprise.summary.failed + withEnterprise.summary.timedOut > 0
      ? 'failed'
      : withEnterprise.summary.flaky > 0
        ? 'flaky'
        : 'passed';
  const base = resolveFilename(opts.reportFilename.replace(/\.html?$/i, ''), status);

  const result: GenerateResult = { reportDir };

  const failedPath = writeFailedRerunArtifact(reportDir, withEnterprise.analytics?.failedRerun);
  if (failedPath) result.failedRerunPath = failedPath;

  const hasTrace = collectHasTrace(withEnterprise);
  if (hasTrace) {
    const viewer = copyTraceViewerAssets(reportDir);
    if (viewer) result.traceViewerPath = path.join(reportDir, viewer);
  }

  // Optional local-first LLM analysis (cluster cache in report dir)
  const aiOpts = (opts as XReportOptions).ai || run.options?.ai;
  let withAi = withEnterprise;
  if (aiOpts?.enabled && isAiConfigured(aiOpts)) {
    try {
      const insights = await analyzeRunWithAi(withEnterprise, reportDir, aiOpts);
      if (insights.length) {
        withAi = { ...withEnterprise, aiInsights: insights };
      }
    } catch (err) {
      if (!opts.quiet) {
        console.warn(
          '[xreport] AI analyze skipped:',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  const writeContext = aiOpts?.writeContextPack !== false;
  if (writeContext) {
    const packed = writeAiContextPack(reportDir, withAi);
    result.aiContextJsonPath = packed.jsonPath;
    result.aiContextMdPath = packed.mdPath;
  }

  if (opts.saveJson) {
    result.jsonPath = path.join(reportDir, 'xreport.json');
    writeJson(result.jsonPath, withAi);
  }

  if (opts.exportCtrf) {
    result.ctrfPath = path.join(reportDir, 'ctrf-report.json');
    writeJson(result.ctrfPath, toCtrf(withAi));
  }

  if (opts.exportCSV) {
    result.csvPath = path.join(reportDir, 'xreport.csv');
    fs.writeFileSync(result.csvPath, toCsv(withAi), 'utf8');
  }

  if (opts.saveHtml) {
    const htmlName = base === 'index' ? 'index.html' : `${base}.html`;
    const forHtml = opts.inlineAssets ? inlineRunAssets(withAi, reportDir) : withAi;
    const html = renderHtml(forHtml, {
      traceViewer: !!result.traceViewerPath,
    });
    result.htmlPath = path.join(reportDir, htmlName);
    fs.writeFileSync(result.htmlPath, html, 'utf8');
    if (htmlName !== 'index.html') {
      fs.writeFileSync(path.join(reportDir, 'index.html'), html, 'utf8');
    }
  }

  if (opts.evidencePack) {
    try {
      const packOpts =
        typeof opts.evidencePack === 'object' ? opts.evidencePack : {};
      const pack = buildEvidencePack(reportDir, withAi, {
        ...packOpts,
        gateResult,
      });
      result.evidenceZipPath = pack.zipPath;
      result.evidenceManifestPath = path.join(pack.folder, 'evidence-manifest.json');
      withAi = {
        ...withAi,
        evidenceSeal: {
          contentHash: pack.manifest.contentHash,
          zipPath: path.basename(pack.zipPath),
          generatedAt: pack.manifest.generatedAt,
        },
      };
      if (readinessCfg) {
        withAi = {
          ...withAi,
          readiness: evaluateReadiness(withAi, {
            checklist: { ...readinessCfg, requireEvidencePack: true },
            gate: gateResult,
            reportDir,
          }),
        };
      }
      if (opts.saveJson && result.jsonPath) writeJson(result.jsonPath, withAi);
      if (opts.saveHtml && result.htmlPath) {
        const html = renderHtml(
          opts.inlineAssets ? inlineRunAssets(withAi, reportDir) : withAi,
          { traceViewer: !!result.traceViewerPath },
        );
        fs.writeFileSync(result.htmlPath, html, 'utf8');
        fs.writeFileSync(path.join(reportDir, 'index.html'), html, 'utf8');
      }
    } catch (err) {
      if (!opts.quiet) {
        console.warn(
          '[xreport] Evidence pack skipped:',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  if (opts.exportPDF && result.htmlPath) {
    try {
      result.pdfPath = path.join(reportDir, 'xreport.pdf');
      await exportPdf(result.htmlPath, result.pdfPath);
    } catch (err) {
      if (!opts.quiet) {
        console.warn(
          '[xreport] PDF export skipped — install playwright or puppeteer to enable exportPDF.',
        );
        if (err instanceof Error) console.warn(err.message);
      }
    }
  }

  if (opts.autoOpen && result.htmlPath && !process.env.CI) {
    try {
      const { openPathOrUrl } = await import('../core/open-url');
      await openPathOrUrl(result.htmlPath);
    } catch {
      // ignore
    }
  }

  if (!opts.quiet) {
    console.log(`\n  XREPORT · by XQA (https://xqa.io)`);
    console.log(`  Report: ${result.htmlPath || reportDir}`);
    if (result.ctrfPath) console.log(`  CTRF:   ${result.ctrfPath}`);
    if (result.csvPath) console.log(`  CSV:    ${result.csvPath}`);
    if (result.pdfPath) console.log(`  PDF:    ${result.pdfPath}`);
    if (result.failedRerunPath) console.log(`  Failed: ${result.failedRerunPath}`);
    if (result.traceViewerPath) console.log(`  Trace:  ${result.traceViewerPath}`);
    if (result.aiContextMdPath) console.log(`  AI:     ${result.aiContextMdPath}`);
    if (result.evidenceZipPath) console.log(`  Evidence: ${result.evidenceZipPath}`);
    if (opts.enableHistory) console.log(`  History: saved (${opts.historyOptions.dbPath})`);
    console.log('');
  }

  return result;
}

function collectHasTrace(run: XReportRun): boolean {
  const walk = (suites: XReportRun['suites'] | undefined): boolean => {
    for (const s of suites || []) {
      for (const t of s.tests || []) {
        if ((t.attachments || []).some((a) => a.type === 'trace' || /\.zip$/i.test(a.path || a.name || ''))) {
          return true;
        }
      }
      if (walk(s.suites)) return true;
    }
    return false;
  };
  return walk(run.suites);
}

/** Embed local attachment files as data URIs for a single self-contained HTML file. */
function inlineRunAssets(run: XReportRun, reportDir: string): XReportRun {
  const clone = structuredClone(run) as XReportRun;
  const walk = (tests: XReportTest[] | undefined) => {
    for (const t of tests || []) {
      for (const a of t.attachments || []) {
        if (a.body) continue;
        if (!a.path) continue;
        const abs = path.isAbsolute(a.path) ? a.path : path.join(reportDir, a.path);
        if (!fs.existsSync(abs)) continue;
        try {
          const buf = fs.readFileSync(abs);
          const mime =
            a.contentType ||
            (a.type === 'screenshot'
              ? 'image/png'
              : a.type === 'video'
                ? 'video/webm'
                : 'application/octet-stream');
          a.body = `data:${mime};base64,${buf.toString('base64')}`;
        } catch {
          // keep path
        }
      }
    }
  };
  const suites = (s: typeof clone.suites | undefined): void => {
    for (const suite of s || []) {
      walk(suite.tests);
      suites(suite.suites);
    }
  };
  suites(clone.suites);
  return clone;
}

async function exportPdf(htmlPath: string, pdfPath: string): Promise<void> {
  let chromium: any;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
      await page.emulateMediaType('print');
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
      });
      await browser.close();
      return;
    } catch {
      throw new Error('Neither playwright nor puppeteer is available');
    }
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
  });
  await browser.close();
}

export function mergeRuns(runs: XReportRun[]): XReportRun {
  if (!runs.length) throw new Error('No runs to merge');
  const base = structuredClone(runs[0]) as XReportRun;
  for (const run of runs.slice(1)) {
    base.suites.push(...run.suites);
    base.finishedAt = Math.max(base.finishedAt, run.finishedAt);
    base.startedAt = Math.min(base.startedAt, run.startedAt);
  }
  base.duration = Math.max(0, base.finishedAt - base.startedAt);
  base.summary = summarize(base.suites, base.duration);
  base.title = base.title || 'Merged XREPORT';
  base.mergeNote = `Merged ${runs.length} shard/worker partials into one report`;
  return enrichRun(base);
}
