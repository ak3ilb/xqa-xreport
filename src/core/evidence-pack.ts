import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import type { QualityGateResult } from './quality-gate';
import type { XReportRun } from './types';
import { XREPORT_VERSION } from './types';
import { ensureDir, writeJson } from './utils';
import { controlMatrixCsv, traceabilityCsv, buildControlMatrix } from './enterprise-tags';
import { collectTests } from './utils';

export interface EvidencePackOptions {
  /** Output zip path or directory (default: <reportDir>/xreport-evidence.zip) */
  output?: string;
  /** Include media/attachments directory if present */
  includeMedia?: boolean;
  gateResult?: QualityGateResult;
}

export interface EvidenceManifest {
  version: string;
  generator: string;
  generatedAt: string;
  reportTitle: string;
  framework: string;
  commit?: string;
  changeTicket?: string;
  buildId?: string;
  pipelineUrl?: string;
  actor?: string;
  summary: XReportRun['summary'];
  gate?: {
    ok: boolean;
    violations: string[];
    counts: QualityGateResult['counts'];
  };
  files: Array<{ path: string; sha256: string; bytes: number }>;
  contentHash: string;
}

function sha256File(filePath: string): string {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function sha256Buf(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function copyIfExists(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Minimal ZIP (store + deflate) writer — no extra dependency. */
function writeZip(zipPath: string, files: Array<{ name: string; data: Buffer }>): void {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8');
    const raw = file.data;
    const compressed = zlib.deflateRawSync(raw);
    const useStore = compressed.length >= raw.length;
    const payload = useStore ? raw : compressed;
    const method = useStore ? 0 : 8;
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    localParts.push(local, payload);
    centralParts.push(central);
    offset += local.length + payload.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  ensureDir(path.dirname(zipPath));
  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralDir, end]));
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c;
}

function walkFiles(dir: string, base = dir): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(base, abs);
    if (fs.statSync(abs).isDirectory()) out.push(...walkFiles(abs, base));
    else out.push({ abs, rel });
  }
  return out;
}

export function buildEvidencePack(
  reportDir: string,
  run: XReportRun,
  options: EvidencePackOptions = {},
): { folder: string; zipPath: string; manifest: EvidenceManifest } {
  const dir = path.resolve(reportDir);
  const staging = path.join(dir, '.evidence-staging');
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  ensureDir(staging);

  const candidates = [
    'index.html',
    'xreport.json',
    'ctrf-report.json',
    'xreport.csv',
    'ai-context.md',
    'ai-context.json',
    'failed-tests.txt',
    'gate-result.json',
  ];
  for (const name of candidates) {
    copyIfExists(path.join(dir, name), path.join(staging, name));
  }

  const tests = collectTests(run.suites);
  const matrix = buildControlMatrix(tests);
  if (matrix.length) {
    fs.writeFileSync(path.join(staging, 'controls-matrix.csv'), controlMatrixCsv(matrix), 'utf8');
  }
  const trace = traceabilityCsv(tests);
  if (trace.split('\n').length > 2) {
    fs.writeFileSync(path.join(staging, 'traceability.csv'), trace, 'utf8');
  }

  if (options.gateResult) {
    writeJson(path.join(staging, 'gate-result.json'), options.gateResult);
  } else if (fs.existsSync(path.join(dir, 'gate-result.json'))) {
    copyIfExists(path.join(dir, 'gate-result.json'), path.join(staging, 'gate-result.json'));
  }

  if (options.includeMedia !== false) {
    for (const sub of ['attachments', 'data', 'traces', 'trace']) {
      const src = path.join(dir, sub);
      if (fs.existsSync(src)) copyDirRecursive(src, path.join(staging, sub));
    }
  }

  const fileEntries = walkFiles(staging);
  const filesMeta = fileEntries.map(({ abs, rel }) => ({
    path: rel.replace(/\\/g, '/'),
    sha256: sha256File(abs),
    bytes: fs.statSync(abs).size,
  }));
  filesMeta.sort((a, b) => a.path.localeCompare(b.path));
  const contentHash = sha256Buf(
    Buffer.from(filesMeta.map((f) => `${f.path}:${f.sha256}`).join('\n'), 'utf8'),
  );

  const env = run.environment || {};
  const manifest: EvidenceManifest = {
    version: XREPORT_VERSION,
    generator: `@xqa.io/xreport@${XREPORT_VERSION}`,
    generatedAt: new Date().toISOString(),
    reportTitle: run.title,
    framework: run.framework,
    commit: typeof env.commit === 'string' ? env.commit : undefined,
    changeTicket:
      typeof env.changeTicket === 'string'
        ? env.changeTicket
        : typeof env.changeId === 'string'
          ? env.changeId
          : undefined,
    buildId: typeof env.buildId === 'string' ? env.buildId : undefined,
    pipelineUrl:
      typeof env.buildUrl === 'string'
        ? env.buildUrl
        : typeof env.pipelineUrl === 'string'
          ? env.pipelineUrl
          : undefined,
    actor: typeof env.actor === 'string' ? env.actor : undefined,
    summary: run.summary,
    gate: options.gateResult
      ? {
          ok: options.gateResult.ok,
          violations: options.gateResult.violations,
          counts: options.gateResult.counts,
        }
      : undefined,
    files: filesMeta,
    contentHash,
  };
  writeJson(path.join(staging, 'evidence-manifest.json'), manifest);
  // refresh file list to include manifest
  const withManifest = walkFiles(staging).map(({ abs, rel }) => ({
    path: rel.replace(/\\/g, '/'),
    sha256: sha256File(abs),
    bytes: fs.statSync(abs).size,
  }));
  withManifest.sort((a, b) => a.path.localeCompare(b.path));
  manifest.files = withManifest.filter((f) => f.path !== 'evidence-manifest.json');
  manifest.contentHash = sha256Buf(
    Buffer.from(manifest.files.map((f) => `${f.path}:${f.sha256}`).join('\n'), 'utf8'),
  );
  writeJson(path.join(staging, 'evidence-manifest.json'), manifest);

  const outArg = options.output
    ? path.resolve(options.output)
    : path.join(dir, 'xreport-evidence.zip');
  const zipPath = outArg.endsWith('.zip') ? outArg : `${outArg.replace(/\/$/, '')}.zip`;
  const folderOut = zipPath.replace(/\.zip$/i, '');

  if (fs.existsSync(folderOut)) fs.rmSync(folderOut, { recursive: true, force: true });
  copyDirRecursive(staging, folderOut);

  const zipFiles = walkFiles(folderOut).map(({ abs, rel }) => ({
    name: rel.replace(/\\/g, '/'),
    data: fs.readFileSync(abs),
  }));
  writeZip(zipPath, zipFiles);

  fs.rmSync(staging, { recursive: true, force: true });

  // Persist seal summary next to report
  writeJson(path.join(dir, 'evidence-seal.json'), {
    contentHash: manifest.contentHash,
    zipPath: path.basename(zipPath),
    generatedAt: manifest.generatedAt,
    changeTicket: manifest.changeTicket,
    commit: manifest.commit,
  });

  return { folder: folderOut, zipPath, manifest };
}
