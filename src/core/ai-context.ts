import * as fs from 'fs';
import * as path from 'path';
import type { XReportRun, XReportTest } from './types';
import type {
  AiContextCluster,
  AiContextPack,
  AiContextTestRef,
  AiInsight,
} from './ai-types';
import { collectTests } from './utils';
import { classifyDefectKind } from './ai-classify';

function toRef(t: XReportTest): AiContextTestRef {
  const err = t.errors[0] || t.attempts.find((a) => a.errors[0])?.errors[0];
  return {
    id: t.id,
    historyId: t.historyId,
    title: t.title,
    fullTitle: t.fullTitle,
    status: t.status,
    file: t.file,
    line: t.line,
    flaky: t.flaky,
    duration: t.duration,
    owner: t.owner,
    severity: t.severity,
    failureCategory: t.failureCategory,
    defectKind: t.defectKind,
    stabilityPct: t.stabilityPct,
    clusterId: t.clusterId,
    errorMessage: err?.message,
    errorStack: err?.stack,
    attempts: (t.attempts || []).map((a) => ({ status: a.status, duration: a.duration })),
  };
}

export function buildAgentPrompt(pack: AiContextPack): string {
  const lines: string[] = [
    'You are helping fix failing automated tests. Use only the evidence below.',
    '',
    `## Run: ${pack.run.title}`,
    `- Framework: ${pack.run.framework}`,
    `- Summary: ${pack.run.summary.passed} passed / ${pack.run.summary.failed} failed / ${pack.run.summary.flaky} flaky / ${pack.run.summary.total} total`,
    pack.run.branch ? `- Branch: ${pack.run.branch}` : '',
    pack.run.commit ? `- Commit: ${pack.run.commit}` : '',
    '',
    '## Top failure clusters (fix root causes, not every test)',
  ];

  for (const c of pack.clusters.slice(0, 8)) {
    lines.push('');
    lines.push(`### Cluster ${c.id} ×${c.count}`);
    lines.push(`- Signature: ${c.signature}`);
    lines.push(`- Category: ${c.category || '—'} · Defect: ${c.defectKind || 'unknown'}`);
    if (c.likelyFixFile) lines.push(`- Likely file: ${c.likelyFixFile}`);
    if (c.insight?.summary) lines.push(`- AI insight: ${c.insight.summary}`);
    lines.push(`- Sample: ${(c.sample || '').slice(0, 400)}`);
    const sampleTest = c.tests[0];
    if (sampleTest) {
      lines.push(`- Example test: ${sampleTest.fullTitle}`);
      if (sampleTest.file) {
        lines.push(`- Example location: ${sampleTest.file}${sampleTest.line ? ':' + sampleTest.line : ''}`);
      }
      if (sampleTest.errorStack) {
        lines.push('```');
        lines.push(sampleTest.errorStack.slice(0, 1200));
        lines.push('```');
      }
    }
  }

  if (pack.failedRerun?.command) {
    lines.push('');
    lines.push('## Rerun failed');
    lines.push('```');
    lines.push(pack.failedRerun.command);
    lines.push('```');
  }

  lines.push('');
  lines.push('## Your task');
  lines.push('1. Identify the highest-impact root cause(s).');
  lines.push('2. Say whether each is product / automation / environment / flake.');
  lines.push('3. Propose concrete code or test changes with file paths.');
  lines.push('4. If evidence is insufficient, say what to inspect next (trace, network, history).');

  return lines.filter((l) => l !== undefined).join('\n');
}

export function buildAiContextPack(run: XReportRun): AiContextPack {
  const tests = collectTests(run.suites);
  const byId = new Map(tests.map((t) => [t.id, t]));
  const insightsByCluster = new Map((run.aiInsights || []).map((i) => [i.clusterId, i]));

  const clusters: AiContextCluster[] = (run.analytics?.clusters || []).map((c) => {
    const clusterTests = c.testIds.map((id) => byId.get(id)).filter(Boolean) as XReportTest[];
    const sample = clusterTests[0];
    const err = sample?.errors[0];
    const defect =
      sample &&
      classifyDefectKind({
        message: err?.message || c.sample,
        stack: err?.stack,
        failureCategory: c.category || sample.failureCategory,
        flaky: sample.flaky || clusterTests.some((t) => t.flaky),
        stabilityPct: sample.stabilityPct,
      });
    const insight = insightsByCluster.get(c.id);
    return {
      id: c.id,
      signature: c.signature,
      count: c.count,
      sample: c.sample,
      category: c.category,
      defectKind: defect?.kind || sample?.defectKind,
      defectConfidence: defect?.confidence ?? sample?.defectConfidence,
      likelyFixFile: defect?.likelyFixFile || sample?.likelyFixFile,
      testIds: c.testIds,
      tests: clusterTests.map(toRef),
      insight,
    };
  });

  const failures = tests
    .filter((t) => t.status === 'failed' || t.status === 'timedOut')
    .map(toRef);
  const flaky = tests.filter((t) => t.flaky).map(toRef);

  const pack: AiContextPack = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: run.generator || '@xqa.io/xreport',
    brand: run.brand || { name: 'XQA', website: 'https://xqa.io' },
    run: {
      title: run.title,
      framework: run.framework,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      duration: run.duration,
      summary: {
        total: run.summary.total,
        passed: run.summary.passed,
        failed: run.summary.failed,
        flaky: run.summary.flaky,
        skipped: run.summary.skipped,
        timedOut: run.summary.timedOut,
      },
      branch: typeof run.environment.branch === 'string' ? run.environment.branch : undefined,
      env: typeof run.environment.env === 'string' ? run.environment.env : undefined,
      commit: typeof run.environment.commit === 'string' ? run.environment.commit : undefined,
    },
    clusters,
    failures,
    flaky,
    quarantine: (run.analytics?.quarantine || []).map((q) => ({
      historyId: q.historyId,
      title: q.title,
      stabilityPct: q.stabilityPct,
      reason: q.reason,
    })),
    insights: run.aiInsights || [],
    failedRerun: run.analytics?.failedRerun,
    agentPrompt: '',
  };
  pack.agentPrompt = buildAgentPrompt(pack);
  return pack;
}

export function renderAiContextMarkdown(pack: AiContextPack): string {
  return `# XREPORT AI context\n\nGenerated: ${pack.generatedAt}\n\n${pack.agentPrompt}\n`;
}

export function writeAiContextPack(
  reportDir: string,
  run: XReportRun,
): { jsonPath: string; mdPath: string; pack: AiContextPack } {
  const pack = buildAiContextPack(run);
  const jsonPath = path.join(reportDir, 'ai-context.json');
  const mdPath = path.join(reportDir, 'ai-context.md');
  fs.writeFileSync(jsonPath, JSON.stringify(pack, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderAiContextMarkdown(pack), 'utf8');
  return { jsonPath, mdPath, pack };
}

export function buildSingleTestPrompt(t: XReportTest): string {
  const err = t.errors[0] || {};
  const defect =
    t.defectKind ||
    classifyDefectKind({
      message: err.message,
      stack: err.stack,
      failureCategory: t.failureCategory,
      flaky: t.flaky,
      stabilityPct: t.stabilityPct,
    }).kind;
  return [
    'Fix this failing automated test. Stay local to the evidence.',
    '',
    `Title: ${t.fullTitle}`,
    `File: ${t.file || '—'}${t.line != null ? ':' + t.line : ''}`,
    `Owner: ${t.owner || '—'} · Severity: ${t.severity || '—'}`,
    `Failure category: ${t.failureCategory || '—'} · Defect kind: ${defect}`,
    `Flaky: ${t.flaky ? 'yes' : 'no'} · Stability: ${t.stabilityPct ?? '—'}%`,
    `Cluster: ${t.clusterId || '—'}`,
    t.likelyFixFile ? `Likely fix file: ${t.likelyFixFile}` : '',
    '',
    'Error:',
    err.message || '(no message)',
    '',
    err.stack || '',
    '',
    'Propose a concrete fix (test and/or product). If flaky, suggest a stabilization approach.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function mergeInsightsIntoPack(pack: AiContextPack, insights: AiInsight[]): AiContextPack {
  const byId = new Map(insights.map((i) => [i.clusterId, i]));
  const next: AiContextPack = {
    ...pack,
    insights,
    clusters: pack.clusters.map((c) => ({
      ...c,
      insight: byId.get(c.id) || c.insight,
    })),
    agentPrompt: '',
  };
  next.agentPrompt = buildAgentPrompt(next);
  return next;
}
