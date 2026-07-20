import * as fs from 'fs';
import * as path from 'path';
import type { XReportAiOptions, AiInsight, DefectKind } from './ai-types';
import type { XReportRun } from './types';
import { buildAiContextPack } from './ai-context';

const CACHE_NAME = 'ai-insight-cache.json';

interface CacheFile {
  version: 1;
  bySignature: Record<string, AiInsight>;
}

function resolveAiOptions(opts?: XReportAiOptions): Required<
  Pick<XReportAiOptions, 'enabled' | 'provider' | 'baseUrl' | 'model'>
> & { apiKey?: string; budget: { maxFailures: number; maxTokens: number } } {
  return {
    enabled: !!opts?.enabled,
    provider: opts?.provider || 'openai-compatible',
    baseUrl:
      opts?.baseUrl ||
      process.env.XREPORT_AI_BASE_URL ||
      'https://api.openai.com/v1',
    apiKey: opts?.apiKey || process.env.XREPORT_AI_API_KEY || undefined,
    model: opts?.model || process.env.XREPORT_AI_MODEL || 'gpt-4.1-mini',
    budget: {
      maxFailures: opts?.budget?.maxFailures ?? 15,
      maxTokens: opts?.budget?.maxTokens ?? 8000,
    },
  };
}

function loadCache(reportDir: string): CacheFile {
  const p = path.join(reportDir, CACHE_NAME);
  if (!fs.existsSync(p)) return { version: 1, bySignature: {} };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as CacheFile;
  } catch {
    return { version: 1, bySignature: {} };
  }
}

function saveCache(reportDir: string, cache: CacheFile): void {
  fs.writeFileSync(path.join(reportDir, CACHE_NAME), JSON.stringify(cache, null, 2), 'utf8');
}

function parseDefectKind(raw: string | undefined): DefectKind {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'product' || v === 'automation' || v === 'environment' || v === 'flake') return v;
  return 'unknown';
}

async function callChatCompletion(
  baseUrl: string,
  apiKey: string | undefined,
  model: string,
  maxTokens: number,
  userPrompt: string,
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model,
    temperature: 0.2,
    max_tokens: Math.min(1200, maxTokens),
    messages: [
      {
        role: 'system',
        content:
          'You are a senior QA engineer. Reply ONLY with compact JSON: ' +
          '{"summary":"3-5 sentences","defectKind":"product|automation|environment|flake|unknown","nextSteps":["..."],"confidence":0.0}',
      },
      { role: 'user', content: userPrompt },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI provider HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || '';
}

function extractJson(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error('AI response was not valid JSON');
  }
}

/**
 * Optional OpenAI-compatible cluster analysis. Uses cache by signature.
 * Never throws to the caller of generateReport — returns [] on soft failure when quiet.
 */
export async function analyzeRunWithAi(
  run: XReportRun,
  reportDir: string,
  options?: XReportAiOptions,
): Promise<AiInsight[]> {
  const opts = resolveAiOptions(options);
  if (!opts.enabled) return run.aiInsights || [];

  const pack = buildAiContextPack(run);
  const cache = loadCache(reportDir);
  const insights: AiInsight[] = [];
  const clusters = pack.clusters.slice(0, opts.budget.maxFailures);

  for (const cluster of clusters) {
    const cached = cache.bySignature[cluster.signature];
    if (cached) {
      insights.push({ ...cached, clusterId: cluster.id });
      continue;
    }

    const sample = cluster.tests[0];
    const prompt = [
      `Cluster signature: ${cluster.signature}`,
      `Heuristic category: ${cluster.category || '—'}`,
      `Heuristic defect: ${cluster.defectKind || '—'}`,
      `Affected tests: ${cluster.count}`,
      sample ? `Example title: ${sample.fullTitle}` : '',
      sample?.file ? `File: ${sample.file}${sample.line != null ? ':' + sample.line : ''}` : '',
      cluster.likelyFixFile ? `Likely file: ${cluster.likelyFixFile}` : '',
      '',
      'Sample error:',
      (sample?.errorMessage || cluster.sample || '').slice(0, 800),
      '',
      'Stack:',
      (sample?.errorStack || '').slice(0, 1500),
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const content = await callChatCompletion(
        opts.baseUrl,
        opts.apiKey,
        opts.model,
        opts.budget.maxTokens,
        prompt,
      );
      const json = extractJson(content);
      const insight: AiInsight = {
        clusterId: cluster.id,
        signature: cluster.signature,
        summary: String(json.summary || '').trim() || 'No summary returned',
        defectKind: parseDefectKind(String(json.defectKind || '')),
        nextSteps: Array.isArray(json.nextSteps)
          ? (json.nextSteps as unknown[]).map((s) => String(s)).slice(0, 6)
          : [],
        confidence: Math.max(0, Math.min(1, Number(json.confidence) || 0.5)),
        model: opts.model,
        createdAt: Date.now(),
      };
      cache.bySignature[cluster.signature] = insight;
      insights.push(insight);
    } catch (err) {
      // Skip cluster; leave heuristic classification in place
      if (process.env.XREPORT_AI_DEBUG) {
        console.warn('[xreport ai]', err instanceof Error ? err.message : err);
      }
    }
  }

  saveCache(reportDir, cache);
  return insights;
}

export function isAiConfigured(options?: XReportAiOptions): boolean {
  const opts = resolveAiOptions(options);
  if (!opts.enabled) return false;
  // Ollama typically needs no key; cloud needs one
  const local =
    /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(opts.baseUrl) ||
    /11434/.test(opts.baseUrl);
  return local || !!opts.apiKey;
}
