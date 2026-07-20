import type { FailureCategory } from './types';
import type { DefectKind } from './ai-types';

/**
 * Stronger signature normalization — strips volatile IDs/URLs/timestamps
 * so equivalent failures cluster together.
 */
export function normalizeErrorSignature(message?: string): string {
  if (!message) return 'unknown';
  return message
    .replace(/https?:\/\/[^\s)'"]+/gi, 'URL')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID')
    .replace(/\b[0-9a-f]{16,}\b/gi, 'HEXID')
    .replace(/0x[0-9a-f]+/gi, 'HEX')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.+-]+Z?\b/g, 'TIMESTAMP')
    .replace(/\b\d{10,13}\b/g, 'EPOCH')
    .replace(/:\d{2,5}\b/g, ':PORT')
    .replace(/\d+/g, 'N')
    .replace(/['"`]+/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
    .toLowerCase();
}

export function classifyFailure(message?: string, stack?: string): FailureCategory {
  const text = `${message || ''} ${stack || ''}`.toLowerCase();
  if (
    /timeout|timed out|exceeded|waiting for|slow|net::err_timed|etag|deadline/i.test(text) ||
    /retry.*timeout/i.test(text)
  ) {
    return 'timing';
  }
  if (
    /econnrefused|enotfound|fetch failed|socket hang up|net::err_|dns|502|503|504|cors|network|econnreset/i.test(
      text,
    )
  ) {
    return 'network';
  }
  if (/expected|assert|tobe|toequal|tohave|to contain|matcher|expect\(|assertion|strictEqual/i.test(text)) {
    return 'assertion';
  }
  if (
    /enoent|permission|env|environment|undefined is not|cannot find module|ci=|browser closed|target closed|crash|spawn|eacces/i.test(
      text,
    )
  ) {
    return 'environment';
  }
  return 'other';
}

export interface DefectClassification {
  kind: DefectKind;
  confidence: number;
  reasons: string[];
  likelyFixFile?: string;
}

/**
 * Map stack frames to a likely source file under the project (heuristic).
 */
export function extractLikelyFixFile(stack?: string): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split('\n');
  for (const line of lines) {
    const m =
      line.match(/\(([^)]+\.[jt]sx?):(\d+)(?::\d+)?\)/) ||
      line.match(/at\s+(?:async\s+)?(?:[^\s(]+\s+)?\(?([^()\s]+\.[jt]sx?):(\d+)/);
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/');
    if (/node_modules|node:internal|internal\/|playwright\/lib|jest-circus|mocha\/lib/i.test(file)) {
      continue;
    }
    return file;
  }
  return undefined;
}

/**
 * Orthogonal defect kind for triage: product vs automation vs environment vs flake.
 */
export function classifyDefectKind(input: {
  message?: string;
  stack?: string;
  failureCategory?: FailureCategory;
  flaky?: boolean;
  stabilityPct?: number;
  /** True when same signature failed with different outcomes on same commit / high flip rate */
  intermittent?: boolean;
}): DefectClassification {
  const reasons: string[] = [];
  const text = `${input.message || ''} ${input.stack || ''}`.toLowerCase();
  const likelyFixFile = extractLikelyFixFile(input.stack);

  if (input.flaky || input.intermittent || (input.stabilityPct != null && input.stabilityPct < 75)) {
    reasons.push(
      input.flaky
        ? 'Marked flaky (fail then pass on retry)'
        : input.intermittent
          ? 'Intermittent across runs'
          : `Low stability (${input.stabilityPct}%)`,
    );
    return { kind: 'flake', confidence: 0.82, reasons, likelyFixFile };
  }

  if (
    input.failureCategory === 'environment' ||
    /enoent|cannot find module|eacces|browser closed|target closed|crash|sandbox|docker|permission denied/i.test(
      text,
    )
  ) {
    reasons.push('Environment / process / module path signals');
    return { kind: 'environment', confidence: 0.78, reasons, likelyFixFile };
  }

  if (
    input.failureCategory === 'network' ||
    /econnrefused|enotfound|502|503|504|dns|socket hang up/i.test(text)
  ) {
    reasons.push('Infrastructure / network failure signals');
    return { kind: 'environment', confidence: 0.74, reasons, likelyFixFile };
  }

  // Locator / selector / playwright test issues → automation
  if (
    /locator|selector|strict mode|resolved to \d+ elements|waiting for locator|getbyrole|getbytext|not found|unable to find|element is not|stale element|no node found|cy\.get|toBeVisible|toBeAttached/i.test(
      text,
    )
  ) {
    reasons.push('Selector / locator / UI-driver signals (likely test automation)');
    return { kind: 'automation', confidence: 0.8, reasons, likelyFixFile };
  }

  if (
    input.failureCategory === 'timing' ||
    /timeout|timed out|waiting for/i.test(text)
  ) {
    // timing can be either product slowness or test waits — lean automation if locator present
    if (/locator|selector|expect\(/i.test(text)) {
      reasons.push('Timeout while waiting on UI assertion');
      return { kind: 'automation', confidence: 0.65, reasons, likelyFixFile };
    }
    reasons.push('Timeout without clear locator — may be product latency or weak waits');
    return { kind: 'unknown', confidence: 0.45, reasons, likelyFixFile };
  }

  if (input.failureCategory === 'assertion') {
    reasons.push('Assertion mismatch — often a product regression (verify expected values)');
    return { kind: 'product', confidence: 0.7, reasons, likelyFixFile };
  }

  reasons.push('Insufficient signals for confident classification');
  return { kind: 'unknown', confidence: 0.35, reasons, likelyFixFile };
}
