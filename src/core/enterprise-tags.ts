import type { XReportTest } from './types';

export type RiskTier = 'critical' | 'high' | 'standard';

const CONTROL_RE = /^@?control[:#-](.+)$/i;
const RISK_RE = /^@?risk[:#-](.+)$/i;
const REQ_RE = /^@?req(?:uirement)?[:#-](.+)$/i;
const LAYER_RE = /^@?layer[:#-](.+)$/i;

function fromTag(tag: string, re: RegExp): string | undefined {
  const m = String(tag || '')
    .trim()
    .match(re);
  return m?.[1]?.trim() || undefined;
}

/** Extract enterprise control / risk / requirement / layer from tags + labels. */
export function parseEnterpriseTags(test: Pick<XReportTest, 'tags' | 'labels' | 'annotations'>): {
  controlIds: string[];
  riskTier: RiskTier[];
  requirementIds: string[];
  layers: string[];
} {
  const controlIds: string[] = [];
  const riskTier: RiskTier[] = [];
  const requirementIds: string[] = [];
  const layers: string[] = [];
  const push = (arr: string[], v?: string) => {
    if (!v) return;
    const n = v.trim();
    if (!n) return;
    if (!arr.some((x) => x.toLowerCase() === n.toLowerCase())) arr.push(n);
  };
  const pushRisk = (v?: string) => {
    if (!v) return;
    const r = v.toLowerCase().trim() as RiskTier;
    if (r === 'critical' || r === 'high' || r === 'standard') {
      if (!riskTier.includes(r)) riskTier.push(r);
    }
  };

  for (const tag of test.tags || []) {
    push(controlIds, fromTag(tag, CONTROL_RE));
    pushRisk(fromTag(tag, RISK_RE));
    push(requirementIds, fromTag(tag, REQ_RE));
    push(layers, fromTag(tag, LAYER_RE));
  }

  const labels = test.labels || {};
  push(controlIds, labels.control || labels.controlId);
  pushRisk(labels.risk || labels.riskTier);
  push(requirementIds, labels.req || labels.requirement || labels.requirementId);
  push(layers, labels.layer);

  for (const a of test.annotations || []) {
    const key = (a.type || '').toLowerCase();
    const val = (a.description || '').trim();
    if (!val) continue;
    if (key === 'control' || key === 'controlid') push(controlIds, val);
    if (key === 'risk') pushRisk(val);
    if (key === 'req' || key === 'requirement') push(requirementIds, val);
    if (key === 'layer') push(layers, val);
  }

  return { controlIds, riskTier, requirementIds, layers };
}

export function applyEnterpriseTagsToTest(test: XReportTest): XReportTest {
  const parsed = parseEnterpriseTags(test);
  const primaryRisk = parsed.riskTier.includes('critical')
    ? 'critical'
    : parsed.riskTier.includes('high')
      ? 'high'
      : parsed.riskTier[0];
  return {
    ...test,
    controlIds: parsed.controlIds.length ? parsed.controlIds : test.controlIds,
    requirementIds: parsed.requirementIds.length ? parsed.requirementIds : test.requirementIds,
    layers: parsed.layers.length ? parsed.layers : test.layers,
    riskTier: primaryRisk || test.riskTier,
  };
}

export interface ControlMatrixRow {
  controlId: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  testIds: string[];
}

export function buildControlMatrix(tests: XReportTest[]): ControlMatrixRow[] {
  const map = new Map<string, ControlMatrixRow>();
  for (const t of tests) {
    const ids = t.controlIds?.length ? t.controlIds : [];
    for (const controlId of ids) {
      const row = map.get(controlId) || {
        controlId,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        testIds: [],
      };
      row.total += 1;
      if (t.status === 'passed') row.passed += 1;
      if (t.status === 'failed' || t.status === 'timedOut') row.failed += 1;
      if (t.status === 'skipped' || t.status === 'pending') row.skipped += 1;
      if (t.flaky) row.flaky += 1;
      row.testIds.push(t.id);
      map.set(controlId, row);
    }
  }
  return [...map.values()].sort((a, b) => b.failed - a.failed || a.controlId.localeCompare(b.controlId));
}

export function controlMatrixCsv(rows: ControlMatrixRow[]): string {
  const lines = ['controlId,total,passed,failed,skipped,flaky'];
  for (const r of rows) {
    lines.push(
      [r.controlId, r.total, r.passed, r.failed, r.skipped, r.flaky]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export function traceabilityCsv(tests: XReportTest[]): string {
  const lines = ['requirementId,controlId,historyId,title,status,riskTier,layer'];
  for (const t of tests) {
    const reqs = t.requirementIds?.length ? t.requirementIds : [''];
    const controls = t.controlIds?.length ? t.controlIds : [''];
    for (const req of reqs) {
      for (const control of controls) {
        if (!req && !control) continue;
        lines.push(
          [
            req,
            control,
            t.historyId,
            t.fullTitle || t.title,
            t.status,
            t.riskTier || '',
            (t.layers || [])[0] || '',
          ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(','),
        );
      }
    }
  }
  return lines.join('\n') + '\n';
}

export interface LayerSummary {
  layer: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
}

export function buildLayerSummary(tests: XReportTest[]): LayerSummary[] {
  const map = new Map<string, LayerSummary>();
  for (const t of tests) {
    const layers = t.layers?.length ? t.layers : ['unspecified'];
    for (const layer of layers) {
      const row = map.get(layer) || { layer, total: 0, passed: 0, failed: 0, flaky: 0 };
      row.total += 1;
      if (t.status === 'passed') row.passed += 1;
      if (t.status === 'failed' || t.status === 'timedOut') row.failed += 1;
      if (t.flaky) row.flaky += 1;
      map.set(layer, row);
    }
  }
  return [...map.values()].sort((a, b) => a.layer.localeCompare(b.layer));
}
