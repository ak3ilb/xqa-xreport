import type { XReportAttachment, XReportError, XReportLogLine, XReportRun, XReportTest } from './types';
import { collectTests, mapSuites } from './utils';

export interface PrivacyOptions {
  /** Redact PHI/PII-like patterns in errors, logs, and attachment names */
  scrubAttachments?: boolean;
  /** Extra regex patterns (string form) to scrub */
  extraPatterns?: string[];
}

const DEFAULT_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'mrn', re: /\b(?:MRN|mrn)[:\s#]*\d{5,}\b/g },
  { name: 'email', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { name: 'phone', re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { name: 'dob', re: /\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/g },
  {
    name: 'card',
    re: /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12})\b/g,
  },
];

function scrubText(input: string | undefined, patterns: Array<{ re: RegExp }>): string | undefined {
  if (!input) return input;
  let out = input;
  for (const p of patterns) {
    out = out.replace(p.re, '[REDACTED]');
  }
  return out;
}

function scrubError(err: XReportError, patterns: Array<{ re: RegExp }>): XReportError {
  return {
    ...err,
    message: scrubText(err.message, patterns) || err.message,
    stack: scrubText(err.stack, patterns),
    value: scrubText(err.value, patterns),
  };
}

function scrubAttachment(a: XReportAttachment, patterns: Array<{ re: RegExp }>): XReportAttachment {
  return {
    ...a,
    name: scrubText(a.name, patterns) || a.name,
    path: a.path ? scrubText(a.path, patterns) || a.path : a.path,
  };
}

function scrubTest(t: XReportTest, patterns: Array<{ re: RegExp }>): XReportTest {
  return {
    ...t,
    errors: (t.errors || []).map((e) => scrubError(e, patterns)),
    attempts: (t.attempts || []).map((att) => ({
      ...att,
      errors: (att.errors || []).map((e) => scrubError(e, patterns)),
    })),
    attachments: (t.attachments || []).map((a) => scrubAttachment(a, patterns)),
    stdout: scrubText(t.stdout, patterns),
    stderr: scrubText(t.stderr, patterns),
    logs: (t.logs || []).map(
      (l: XReportLogLine): XReportLogLine => ({
        ...l,
        text: scrubText(l.text, patterns) || l.text,
      }),
    ),
  };
}

/** Apply privacy scrubbing. Does not claim HIPAA certification — tooling only. */
export function applyPrivacyScrub(run: XReportRun, privacy?: PrivacyOptions): XReportRun {
  if (!privacy?.scrubAttachments) return run;
  const extras = (privacy.extraPatterns || [])
    .map((s) => {
      try {
        return { name: 'extra', re: new RegExp(s, 'gi') };
      } catch {
        return undefined;
      }
    })
    .filter(Boolean) as Array<{ name: string; re: RegExp }>;
  const patterns = [...DEFAULT_PATTERNS, ...extras];

  const suites = mapSuites(run.suites, (t) => scrubTest(t, patterns));
  return {
    ...run,
    suites,
    environment: {
      ...run.environment,
      privacyMode: 'scrubbed',
    },
    options: {
      ...run.options,
      privacy: { ...privacy, scrubAttachments: true },
    },
  };
}

export function countScrubTargets(run: XReportRun): number {
  return collectTests(run.suites).length;
}
