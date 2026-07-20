import * as fs from 'fs';
import * as path from 'path';
import { ensureDir } from './utils';

/**
 * Copy Playwright's bundled trace viewer into the report directory when available.
 * Returns relative path to viewer index, or undefined.
 */
export function copyTraceViewerAssets(reportDir: string): string | undefined {
  const candidates = [
    () => {
      try {
        const core = require.resolve('playwright-core/package.json');
        return path.join(path.dirname(core), 'lib', 'vite', 'traceViewer');
      } catch {
        return undefined;
      }
    },
    () => {
      try {
        const pw = require.resolve('playwright/package.json');
        return path.join(path.dirname(pw), '..', 'playwright-core', 'lib', 'vite', 'traceViewer');
      } catch {
        return undefined;
      }
    },
    () => {
      try {
        const apt = require.resolve('@playwright/test/package.json');
        return path.join(
          path.dirname(apt),
          '..',
          'playwright-core',
          'lib',
          'vite',
          'traceViewer',
        );
      } catch {
        return undefined;
      }
    },
  ];

  let src: string | undefined;
  for (const resolve of candidates) {
    const dir = resolve();
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) {
      src = dir;
      break;
    }
  }
  if (!src) return undefined;

  const dest = path.join(reportDir, 'trace-viewer');
  ensureDir(dest);
  copyDirRecursive(src, dest);
  return 'trace-viewer/index.html';
}

function copyDirRecursive(from: string, to: string): void {
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function writeFailedRerunArtifact(
  reportDir: string,
  failedRerun: { command: string; files: string[]; count: number } | undefined,
): string | undefined {
  if (!failedRerun?.count) return undefined;
  const file = path.join(reportDir, 'failed-tests.txt');
  const body = [
    `# XREPORT failed tests (${failedRerun.count})`,
    `# Suggested command:`,
    failedRerun.command,
    '',
    ...failedRerun.files,
    '',
  ].join('\n');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}
