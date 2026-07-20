/** Local-first AI types for XREPORT */

import type { FailureCategory, TestStatus } from './types';

/** High-level defect kind for triage (orthogonal to FailureCategory). */
export type DefectKind = 'product' | 'automation' | 'environment' | 'flake' | 'unknown';

export interface XReportAiBudget {
  /** Max unique clusters to send to the LLM (default 15) */
  maxFailures?: number;
  /** Soft max completion tokens per request (default 8000) */
  maxTokens?: number;
}

export interface XReportAiOptions {
  /** Enable LLM analysis during report generation (default false) */
  enabled?: boolean;
  /** openai-compatible HTTP API */
  provider?: 'openai-compatible';
  /** e.g. https://api.openai.com/v1 or http://127.0.0.1:11434/v1 */
  baseUrl?: string;
  /** From env XREPORT_AI_API_KEY when omitted */
  apiKey?: string;
  model?: string;
  budget?: XReportAiBudget;
  /** Always write ai-context.md/json (default true) */
  writeContextPack?: boolean;
}

export interface AiInsight {
  clusterId: string;
  signature: string;
  summary: string;
  defectKind: DefectKind;
  nextSteps: string[];
  confidence: number;
  model?: string;
  createdAt: number;
}

export interface AiContextTestRef {
  id: string;
  historyId?: string;
  title: string;
  fullTitle: string;
  status: TestStatus;
  file?: string;
  line?: number;
  flaky?: boolean;
  duration: number;
  owner?: string;
  severity?: string;
  failureCategory?: FailureCategory;
  defectKind?: DefectKind;
  stabilityPct?: number;
  clusterId?: string;
  errorMessage?: string;
  errorStack?: string;
  attempts?: Array<{ status: TestStatus; duration: number }>;
}

export interface AiContextCluster {
  id: string;
  signature: string;
  count: number;
  sample: string;
  category?: FailureCategory;
  defectKind?: DefectKind;
  defectConfidence?: number;
  likelyFixFile?: string;
  testIds: string[];
  tests: AiContextTestRef[];
  insight?: AiInsight;
}

export interface AiContextPack {
  version: 1;
  generatedAt: string;
  generator: string;
  brand: { name: string; website: string };
  run: {
    title: string;
    framework: string;
    startedAt: number;
    finishedAt: number;
    duration: number;
    summary: {
      total: number;
      passed: number;
      failed: number;
      flaky: number;
      skipped: number;
      timedOut: number;
    };
    branch?: string;
    env?: string;
    commit?: string;
  };
  clusters: AiContextCluster[];
  failures: AiContextTestRef[];
  flaky: AiContextTestRef[];
  quarantine: Array<{ historyId: string; title: string; stabilityPct: number; reason: string }>;
  insights: AiInsight[];
  failedRerun?: { command: string; files: string[]; count: number };
  agentPrompt: string;
}
