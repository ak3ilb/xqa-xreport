import * as fs from 'fs';
import * as path from 'path';
import { createId, copyFileSafe, ensureDir } from './utils';
import type { ContextType, XReportAttachment } from './types';

export interface MediaStore {
  reportDir: string;
  mediaDir: string;
}

export function createMediaStore(reportDir: string): MediaStore {
  const mediaDir = path.join(reportDir, 'media');
  ensureDir(mediaDir);
  return { reportDir, mediaDir };
}

export function storeAttachment(
  store: MediaStore,
  input: {
    name: string;
    type: ContextType;
    source?: string;
    body?: string | Buffer;
    contentType?: string;
  },
): XReportAttachment {
  const id = createId('att');
  const safeName = input.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'attachment';
  let relPath: string | undefined;
  let body: string | undefined = typeof input.body === 'string' ? input.body : undefined;

  if (Buffer.isBuffer(input.body)) {
    const ext =
      input.type === 'video' ? '.webm' : input.type === 'screenshot' ? '.png' : '.bin';
    const abs = path.join(store.mediaDir, `${id}-${safeName}${ext}`);
    fs.writeFileSync(abs, input.body);
    relPath = path.relative(store.reportDir, abs).split(path.sep).join('/');
  } else if (input.source) {
    if (input.source.startsWith('data:') || input.source.startsWith('http')) {
      body = input.source;
    } else if (fs.existsSync(input.source)) {
      const ext = path.extname(input.source) || '';
      const abs = path.join(store.mediaDir, `${id}-${safeName}${ext}`);
      const copied = copyFileSafe(input.source, abs);
      if (copied) relPath = path.relative(store.reportDir, copied).split(path.sep).join('/');
    } else {
      body = input.source;
    }
  }

  return {
    id,
    name: input.name,
    type: input.type,
    path: relPath,
    contentType: input.contentType,
    body,
  };
}
