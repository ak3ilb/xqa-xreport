import type { XReportRun, XReportTest } from './types';
import { collectTests } from './utils';
import type { QualityGateResult } from './quality-gate';
import * as fs from 'fs';
import * as path from 'path';

export type ReadinessStatus = 'pass' | 'warn' | 'block';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail?: string;
}

export interface ReadinessChecklistConfig {
  /** Require at least one @risk:critical case to pass when any critical exists */
  requireCriticalGreen?: boolean;
  /** Require tags present: @dr / @reconcile / @readiness */
  requireTags?: string[];
  /** Fail (block) when product defect clusters > 0 */
  blockOnProductClusters?: boolean;
  /** Warn/block if evidence seal missing */
  requireEvidencePack?: boolean;
}

export interface ReadinessResult {
  status: ReadinessStatus;
  checks: ReadinessCheck[];
}

function hasTag(t: XReportTest, needle: string): boolean {
  const n = needle.toLowerCase().replace(/^@/, '');
  return (t.tags || []).some((tag) => tag.toLowerCase().replace(/^@/, '') === n || tag.toLowerCase().includes(n));
}

export function evaluateReadiness(
  run: XReportRun,
  options: {
    checklist?: ReadinessChecklistConfig;
    gate?: QualityGateResult;
    reportDir?: string;
  } = {},
): ReadinessResult {
  const user = options.checklist || run.options?.readiness || {};
  const cfg: ReadinessChecklistConfig = {
    requireCriticalGreen: user.requireCriticalGreen !== false,
    requireTags: user.requireTags ?? [],
    blockOnProductClusters: user.blockOnProductClusters !== false,
    requireEvidencePack: !!user.requireEvidencePack,
    ...user,
  };
  const tests = collectTests(run.suites);
  const checks: ReadinessCheck[] = [];

  const critical = tests.filter((t) => t.riskTier === 'critical');
  if (cfg.requireCriticalGreen) {
    if (critical.length) {
      const failed = critical.filter((t) => t.status === 'failed' || t.status === 'timedOut');
      checks.push({
        id: 'critical-green',
        label: 'Critical-risk cases green',
        status: failed.length ? 'block' : 'pass',
        detail: failed.length
          ? `${failed.length}/${critical.length} critical failed`
          : `${critical.length} critical passed/skipped`,
      });
    } else {
      checks.push({
        id: 'critical-green',
        label: 'Critical-risk cases green',
        status: 'warn',
        detail: 'No @risk:critical cases in this report',
      });
    }
  }

  for (const tag of cfg.requireTags || []) {
    const present = tests.some((t) => hasTag(t, tag));
    checks.push({
      id: `tag-${tag}`,
      label: `Suite tagged @${tag.replace(/^@/, '')}`,
      status: present ? 'pass' : 'warn',
      detail: present ? 'Present' : 'Not found this run',
    });
  }

  const productClusters = (run.analytics?.clusters || []).filter((c) => c.defectKind === 'product');
  if (cfg.blockOnProductClusters) {
    checks.push({
      id: 'product-clusters',
      label: 'No open product-defect clusters',
      status: productClusters.length ? 'block' : 'pass',
      detail: productClusters.length ? `${productClusters.length} product cluster(s)` : 'None',
    });
  }

  if (options.gate) {
    checks.push({
      id: 'quality-gate',
      label: 'Quality gate',
      status: options.gate.ok ? 'pass' : 'block',
      detail: options.gate.ok ? 'OK' : options.gate.violations.join('; '),
    });
  }

  if (cfg.requireEvidencePack && options.reportDir) {
    const seal = path.join(options.reportDir, 'evidence-seal.json');
    const zip = path.join(options.reportDir, 'xreport-evidence.zip');
    const ok = fs.existsSync(seal) || fs.existsSync(zip);
    checks.push({
      id: 'evidence-pack',
      label: 'Evidence pack generated',
      status: ok ? 'pass' : 'block',
      detail: ok ? 'Sealed' : 'Missing evidence-seal.json / xreport-evidence.zip',
    });
  }

  const status: ReadinessStatus = checks.some((c) => c.status === 'block')
    ? 'block'
    : checks.some((c) => c.status === 'warn')
      ? 'warn'
      : 'pass';
  return { status, checks };
}
