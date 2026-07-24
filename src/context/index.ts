import type { ContextType, XReportAttachment, XReportStep } from '../core/types';

type ContextValue =
  | string
  | {
      type?: ContextType;
      title?: string;
      name?: string;
      value?: unknown;
      path?: string;
      body?: string | Buffer;
      contentType?: string;
    };

const STORE_KEY = '__xreport_attachments__';
const META_KEY = '__xreport_meta__';

/** Keyed store for Jest / Vitest / Cypress tasks (no Mocha `this`) */
const keyedAttachments = new Map<string, XReportAttachment[]>();
const keyedSteps = new Map<string, XReportStep[]>();
const keyedMeta = new Map<string, { owner?: string; severity?: string; labels?: Record<string, string> }>();

type ContextMeta = { owner?: string; severity?: string; labels?: Record<string, string> };

function normalizeKey(key: string): string {
  return String(key || '')
    .trim()
    .replace(/\s*›\s*/g, ' › ')
    .replace(/\s*>\s*/g, ' › ');
}

function push(target: any, attachment: Omit<XReportAttachment, 'id'> & { id?: string }): void {
  if (!target || typeof target !== 'object') return;
  if (!Array.isArray(target[STORE_KEY])) target[STORE_KEY] = [];
  target[STORE_KEY].push({
    id: attachment.id || `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: attachment.name,
    type: attachment.type,
    path: attachment.path,
    body: attachment.body,
    contentType: attachment.contentType,
  } satisfies XReportAttachment);
}

function toAttachment(context: ContextValue): Omit<XReportAttachment, 'id'> {
  if (typeof context === 'string') {
    return { name: 'Context', type: 'text', body: context };
  }
  const type = context.type || 'text';
  const name = context.title || context.name || type;
  if (type === 'json') {
    return {
      name,
      type: 'json',
      body:
        typeof context.value === 'string'
          ? context.value
          : JSON.stringify(context.value, null, 2),
      contentType: 'application/json',
    };
  }
  if (type === 'screenshot' || type === 'video' || type === 'file' || type === 'trace') {
    if (Buffer.isBuffer(context.body)) {
      const mime =
        context.contentType ||
        (type === 'screenshot' ? 'image/png' : type === 'video' ? 'video/webm' : 'application/octet-stream');
      return {
        name,
        type,
        body: `data:${mime};base64,${context.body.toString('base64')}`,
        contentType: mime,
      };
    }
    return {
      name,
      type,
      path: context.path,
      body: typeof context.body === 'string' ? context.body : undefined,
      contentType: context.contentType,
    };
  }
  return {
    name,
    type: type === 'code' ? 'code' : 'text',
    body: String(context.value ?? context.body ?? ''),
  };
}

function pushKeyed(key: string, attachment: Omit<XReportAttachment, 'id'>): void {
  const k = normalizeKey(key);
  if (!k) return;
  const list = keyedAttachments.get(k) || [];
  list.push({
    id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...attachment,
  });
  keyedAttachments.set(k, list);
}

function detectCurrentTestKey(): string | undefined {
  try {
    // Jest / Vitest expose expect.getState().currentTestName
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis as any;
    const expectFn = g.expect;
    const state = expectFn?.getState?.();
    if (state?.currentTestName) return normalizeKey(String(state.currentTestName));
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Attach context to a Mocha/Jasmine test (`this` or `this.test`),
 * or pass a string key for Jest/Vitest: `attach.to('suite › test', …)`.
 *
 * @example
 * attach(this, 'hello');
 * attach(this, { type: 'json', title: 'Data', value: { ok: true } });
 * attach.to('auth › login', { type: 'json', title: 'token', value: { ok: true } });
 * attach.note({ type: 'text', title: 'hint', value: 'uses current Jest/Vitest test name' });
 */
export function attach(testObj: any, context: ContextValue): void {
  const target = testObj?.test || testObj;
  const att = toAttachment(context);
  push(target, att);
}

/** Attach using an explicit test key (Jest fullName, Vitest title path, Cypress title path). */
attach.to = function attachTo(key: string, context: ContextValue): void {
  pushKeyed(key, toAttachment(context));
};

/**
 * Attach to the currently running Jest/Vitest test (via `expect.getState().currentTestName`).
 * Falls back silently if no current test is detected.
 */
attach.note = function attachNote(context: ContextValue): void {
  const key = detectCurrentTestKey();
  if (key) pushKeyed(key, toAttachment(context));
};

/** Set owner / severity / labels for a keyed test (Jest/Vitest/Cypress). */
attach.meta = function attachMeta(keyOrMeta: string | ContextMeta, maybeMeta?: ContextMeta): void {
  if (typeof keyOrMeta === 'string') {
    const k = normalizeKey(keyOrMeta);
    if (!k || !maybeMeta) return;
    keyedMeta.set(k, { ...(keyedMeta.get(k) || {}), ...maybeMeta });
    return;
  }
  const key = detectCurrentTestKey();
  if (!key) return;
  keyedMeta.set(key, { ...(keyedMeta.get(key) || {}), ...keyOrMeta });
};

/** Record steps for a keyed test (used by Cypress command log + manual steps). */
attach.steps = function attachSteps(key: string, steps: XReportStep[]): void {
  const k = normalizeKey(key);
  if (!k) return;
  const prev = keyedSteps.get(k) || [];
  keyedSteps.set(k, prev.concat(steps || []));
};

attach.screenshot = async function screenshot(
  testObjOrSource: any,
  sourceOrTitle?: string | Buffer,
  title = 'Screenshot',
): Promise<void> {
  // Jest/Vitest: attach.screenshot(buf) or attach.screenshot('/path.png', 'title')
  if (
    typeof testObjOrSource === 'string' ||
    Buffer.isBuffer(testObjOrSource) ||
    testObjOrSource == null
  ) {
    const key = detectCurrentTestKey();
    if (!key) return;
    const source = testObjOrSource as string | Buffer;
    const name = typeof sourceOrTitle === 'string' ? sourceOrTitle : title;
    if (Buffer.isBuffer(source)) {
      pushKeyed(key, {
        name,
        type: 'screenshot',
        body: `data:image/png;base64,${source.toString('base64')}`,
        contentType: 'image/png',
      });
      return;
    }
    if (typeof source === 'string') pushKeyed(key, { name, type: 'screenshot', path: source });
    return;
  }
  const target = testObjOrSource?.test || testObjOrSource;
  const source = sourceOrTitle as string | Buffer;
  if (Buffer.isBuffer(source)) {
    push(target, {
      name: title,
      type: 'screenshot',
      body: `data:image/png;base64,${source.toString('base64')}`,
      contentType: 'image/png',
    });
    return;
  }
  push(target, { name: title, type: 'screenshot', path: source });
};

attach.video = async function video(
  testObjOrSource: any,
  sourceOrTitle?: string,
  title = 'Video',
): Promise<void> {
  if (typeof testObjOrSource === 'string' || testObjOrSource == null) {
    const key = detectCurrentTestKey();
    if (!key) return;
    const source = String(testObjOrSource || sourceOrTitle || '');
    const name = typeof sourceOrTitle === 'string' && testObjOrSource ? sourceOrTitle : title;
    if (source) pushKeyed(key, { name, type: 'video', path: source });
    return;
  }
  const target = testObjOrSource?.test || testObjOrSource;
  push(target, { name: title, type: 'video', path: String(sourceOrTitle || '') });
};

/** Attach a local file (screenshot/video/trace/json) to the current Jest/Vitest test. */
attach.file = function attachFile(
  filePath: string,
  opts?: { title?: string; type?: 'screenshot' | 'video' | 'trace' | 'file' | 'json' },
): void {
  const key = detectCurrentTestKey();
  if (!key || !filePath) return;
  const type = opts?.type || 'file';
  pushKeyed(key, {
    name: opts?.title || pathBasename(filePath),
    type,
    path: filePath,
  });
};

function pathBasename(p: string): string {
  const parts = String(p).split(/[/\\]/);
  return parts[parts.length - 1] || 'file';
}

/** @deprecated Prefer `attach` — alias for familiarity */
export const testContext = attach;

export function takeAttachments(testObj: any): XReportAttachment[] {
  const target = testObj?.test || testObj;
  const list = (target && target[STORE_KEY]) as XReportAttachment[] | undefined;
  return Array.isArray(list) ? [...list] : [];
}

/** Collect keyed attachments for one or more title variants. */
export function takeAttachmentsFor(...keys: Array<string | undefined | null>): XReportAttachment[] {
  const out: XReportAttachment[] = [];
  const seen = new Set<string>();
  for (const raw of keys) {
    if (!raw) continue;
    const k = normalizeKey(raw);
    const list = keyedAttachments.get(k);
    if (!list) continue;
    for (const a of list) {
      const id = a.id || `${a.name}:${a.path || a.body?.slice(0, 24)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(a);
    }
  }
  return out;
}

export function takeStepsFor(...keys: Array<string | undefined | null>): XReportStep[] {
  for (const raw of keys) {
    if (!raw) continue;
    const list = keyedSteps.get(normalizeKey(raw));
    if (list?.length) return [...list];
  }
  return [];
}

export function takeMetaFor(
  ...keys: Array<string | undefined | null>
): ContextMeta | undefined {
  for (const raw of keys) {
    if (!raw) continue;
    const meta = keyedMeta.get(normalizeKey(raw));
    if (meta) return { ...meta };
  }
  return undefined;
}

/** Clear keyed stores (called after report generate in reporters). */
export function clearKeyedContext(): void {
  keyedAttachments.clear();
  keyedSteps.clear();
  keyedMeta.clear();
}

export { STORE_KEY as ATTACHMENTS_KEY, META_KEY, normalizeKey };
