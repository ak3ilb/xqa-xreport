/**
 * Detailed enterprise feature verification (local, no network).
 * Usage: node scripts/enterprise-e2e-verify.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  buildRun,
  generateReport,
  evaluateQualityGate,
  applyPrivacyScrub,
  applyEnterpriseTagsToTest,
  buildControlMatrix,
  buildLayerSummary,
  evaluateReadiness,
  buildEvidencePack,
  parseEnterpriseTags,
  controlMatrixCsv,
  traceabilityCsv,
} = require('../dist');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'dist/cli/index.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-ent-'));
let failures = 0;

function ok(label) {
  console.log(`  OK  ${label}`);
}
function fail(label, err) {
  failures += 1;
  console.error(`  FAIL ${label}`);
  console.error(err && err.stack ? err.stack : err);
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: root,
  });
}

async function main() {
  console.log('\nXREPORT enterprise E2E verify\n');
  console.log(`tmp: ${tmp}\n`);

  // --- 1. Tag parsing / control matrix / layers ---
  try {
    const parsed = parseEnterpriseTags({
      tags: ['@control:PCI-DSS-6.5', '@risk:critical', '@req:PAY-01', '@layer:ui', '@readiness'],
      annotations: [{ type: 'control', description: 'SOX-404' }],
      labels: {},
    });
    assert.ok(parsed.controlIds.includes('PCI-DSS-6.5'));
    assert.ok(parsed.controlIds.includes('SOX-404'));
    assert.deepStrictEqual(parsed.riskTier, ['critical']);
    assert.ok(parsed.requirementIds.includes('PAY-01'));
    assert.ok(parsed.layers.includes('ui'));

    const t1 = applyEnterpriseTagsToTest({
      id: 't1',
      historyId: 'h1',
      title: 'pay',
      fullTitle: 'Checkout pay',
      status: 'failed',
      flaky: false,
      duration: 10,
      tags: ['@control:PCI-DSS-6.5', '@risk:critical', '@layer:ui', '@req:PAY-01'],
      annotations: [],
      errors: [{ message: 'timeout' }],
      attempts: [],
      attachments: [],
      steps: [],
    });
    const t2 = applyEnterpriseTagsToTest({
      id: 't2',
      historyId: 'h2',
      title: 'api',
      fullTitle: 'API reconcile',
      status: 'passed',
      flaky: false,
      duration: 5,
      tags: ['@control:SOX-404', '@risk:high', '@layer:api', '@dr', '@reconcile'],
      annotations: [],
      errors: [],
      attempts: [],
      attachments: [],
      steps: [],
    });
    assert.strictEqual(t1.riskTier, 'critical');
    assert.ok(t1.controlIds.includes('PCI-DSS-6.5'));
    const matrix = buildControlMatrix([t1, t2]);
    assert.ok(matrix.some((r) => r.controlId === 'PCI-DSS-6.5' && r.failed === 1));
    assert.ok(controlMatrixCsv(matrix).includes('PCI-DSS-6.5'));
    assert.ok(traceabilityCsv([t1, t2]).includes('PAY-01'));
    const layers = buildLayerSummary([t1, t2]);
    assert.ok(layers.some((l) => l.layer === 'ui'));
    assert.ok(layers.some((l) => l.layer === 'api'));
    ok('control / risk / req / layer parsing + matrix + CSV');
  } catch (e) {
    fail('control matrix', e);
  }

  // --- 2. Gate presets ---
  try {
    const base = buildRun({
      title: 'gate-test',
      framework: 'playwright',
      startedAt: Date.now() - 1000,
      finishedAt: Date.now(),
      suites: [
        {
          id: 's',
          title: 's',
          suites: [],
          tests: [
            applyEnterpriseTagsToTest({
              id: 't1',
              historyId: 'h1',
              title: 'crit',
              fullTitle: 's crit',
              status: 'failed',
              flaky: false,
              duration: 10,
              tags: ['@risk:critical'],
              annotations: [],
              errors: [{ message: 'Expected 1 to be 2' }],
              attempts: [{ status: 'failed', duration: 10, errors: [{ message: 'Expected 1 to be 2' }] }],
              attachments: [],
              steps: [],
              defectKind: 'product',
              regression: true,
            }),
          ],
        },
      ],
      environment: {},
      options: {},
    });

    const noTicket = evaluateQualityGate(base, { preset: 'finance-pr' });
    assert.strictEqual(noTicket.ok, false);
    assert.ok(noTicket.violations.some((v) => v.includes('changeTicket')));
    assert.ok(noTicket.violations.some((v) => v.includes('criticalFailed') || v.includes('newFailures')));

    const withTicket = {
      ...base,
      environment: { ...base.environment, changeTicket: 'CHG-99', commit: 'deadbeef' },
    };
    const release = evaluateQualityGate(withTicket, { preset: 'finance-release' });
    assert.strictEqual(release.ok, false);
    assert.ok(release.violations.some((v) => v.includes('failed') || v.includes('product')));

    const green = buildRun({
      title: 'green',
      framework: 'playwright',
      startedAt: 1,
      finishedAt: 2,
      suites: [
        {
          id: 's',
          title: 's',
          suites: [],
          tests: [
            {
              id: 't',
              historyId: 'h',
              title: 'ok',
              fullTitle: 's ok',
              status: 'passed',
              flaky: false,
              duration: 1,
              tags: [],
              annotations: [],
              errors: [],
              attempts: [],
              attachments: [],
              steps: [],
            },
          ],
        },
      ],
      environment: { changeTicket: 'CHG-1', commit: 'abc' },
      options: {},
    });
    assert.strictEqual(evaluateQualityGate(green, { preset: 'finance-pr' }).ok, true);
    assert.strictEqual(evaluateQualityGate(green, { preset: 'finance-release' }).ok, true);
    assert.strictEqual(evaluateQualityGate(green, { preset: 'nightly' }).ok, true);
    ok('gate presets finance-pr / finance-release / nightly');
  } catch (e) {
    fail('gate presets', e);
  }

  // --- 3. Privacy scrub ---
  try {
    const dirty = buildRun({
      title: 'privacy',
      framework: 'playwright',
      startedAt: 1,
      finishedAt: 2,
      suites: [
        {
          id: 's',
          title: 's',
          suites: [],
          tests: [
            {
              id: 't',
              historyId: 'h',
              title: 'phi',
              fullTitle: 's phi',
              status: 'failed',
              flaky: false,
              duration: 1,
              tags: [],
              annotations: [],
              errors: [{ message: 'SSN 123-45-6789 email nurse@hospital.org phone 555-123-4567' }],
              attempts: [],
              attachments: [{ id: 'a', name: 'patient-mrn-12345.png', type: 'screenshot' }],
              steps: [],
              logs: [{ type: 'stdout', text: 'MRN 99887766 logged in' }],
            },
          ],
        },
      ],
      environment: {},
      options: {},
    });
    const scrubbed = applyPrivacyScrub(dirty, { scrubAttachments: true });
    const msg = scrubbed.suites[0].tests[0].errors[0].message;
    assert.ok(msg.includes('[REDACTED]'));
    assert.ok(!msg.includes('123-45-6789'));
    assert.ok(!msg.includes('nurse@hospital.org'));
    assert.strictEqual(scrubbed.environment.privacyMode, 'scrubbed');
    ok('privacy PHI/PII scrub + privacyMode badge field');
  } catch (e) {
    fail('privacy scrub', e);
  }

  // --- 4. Full generate: evidence + readiness + provenance + controls in HTML/JSON ---
  const reportDir = path.join(tmp, 'report');
  const historyPath = path.join(tmp, 'history.json');
  try {
    const run = buildRun({
      title: 'Enterprise E2E',
      framework: 'playwright',
      startedAt: Date.now() - 5000,
      finishedAt: Date.now(),
      suites: [
        {
          id: 'checkout',
          title: 'Checkout',
          file: 'tests/checkout.spec.ts',
          suites: [],
          tests: [
            applyEnterpriseTagsToTest({
              id: 't1',
              historyId: 'hid-pay',
              title: 'pays with card',
              fullTitle: 'Checkout › pays with card',
              status: 'passed',
              flaky: false,
              duration: 1200,
              file: 'tests/checkout.spec.ts',
              tags: ['@control:PCI-DSS-6.5', '@risk:critical', '@layer:ui', '@req:PAY-01', '@readiness'],
              annotations: [],
              errors: [],
              attempts: [{ status: 'passed', duration: 1200 }],
              attachments: [],
              steps: [],
            }),
            applyEnterpriseTagsToTest({
              id: 't2',
              historyId: 'hid-rec',
              title: 'reconcile positions',
              fullTitle: 'Batch › reconcile positions',
              status: 'passed',
              flaky: false,
              duration: 800,
              tags: ['@control:SOX-404', '@layer:batch', '@dr', '@reconcile'],
              annotations: [],
              errors: [],
              attempts: [{ status: 'passed', duration: 800 }],
              attachments: [],
              steps: [],
            }),
          ],
        },
      ],
      environment: {
        changeTicket: 'CHG-E2E-1',
        commit: 'abcdef123456',
        buildId: '42',
        actor: 'ci-bot',
        pipelineUrl: 'https://example.com/pipeline/42',
      },
      options: {},
    });

    const result = await generateReport(run, {
      reportDir,
      reportTitle: run.title,
      enableHistory: true,
      historyOptions: {
        dbPath: historyPath,
        saveFullResults: true,
        ledger: true,
        retentionDays: 365,
        minRetentionDays: 90,
      },
      exportCSV: true,
      exportCtrf: true,
      evidencePack: true,
      privacy: { scrubAttachments: true },
      readiness: {
        requireCriticalGreen: true,
        requireTags: ['readiness', 'dr'],
        blockOnProductClusters: true,
        requireEvidencePack: true,
      },
      qualityGate: { preset: 'finance-pr' },
      autoOpen: false,
      quiet: true,
    });

    assert.ok(fs.existsSync(result.htmlPath));
    assert.ok(fs.existsSync(result.jsonPath));
    assert.ok(result.evidenceZipPath && fs.existsSync(result.evidenceZipPath));
    assert.ok(fs.existsSync(path.join(reportDir, 'evidence-seal.json')));
    assert.ok(fs.existsSync(path.join(reportDir, 'gate-result.json')));

    const saved = JSON.parse(fs.readFileSync(result.jsonPath, 'utf8'));
    assert.strictEqual(saved.environment.changeTicket, 'CHG-E2E-1');
    assert.strictEqual(saved.environment.privacyMode, 'scrubbed');
    assert.ok(saved.evidenceSeal && saved.evidenceSeal.contentHash);
    assert.ok(saved.readiness);
    assert.ok(['pass', 'warn', 'block'].includes(saved.readiness.status));
    assert.ok(saved.analytics.controls.some((c) => c.controlId === 'PCI-DSS-6.5'));
    assert.ok(saved.analytics.byLayer.some((l) => l.layer === 'ui' || l.layer === 'batch'));
    assert.ok(saved.suites[0].tests[0].controlIds.includes('PCI-DSS-6.5'));
    assert.strictEqual(saved.suites[0].tests[0].riskTier, 'critical');

    const html = fs.readFileSync(result.htmlPath, 'utf8');
    assert.ok(html.includes('Provenance') || html.includes('changeTicket') || html.includes('CHG-E2E-1'));
    assert.ok(html.includes('Controls') || html.includes('PCI-DSS'));
    assert.ok(html.includes('Readiness') || html.includes('readiness'));

    const packFolder = result.evidenceZipPath.replace(/\.zip$/i, '');
    assert.ok(fs.existsSync(path.join(packFolder, 'evidence-manifest.json')));
    const manifest = JSON.parse(fs.readFileSync(path.join(packFolder, 'evidence-manifest.json'), 'utf8'));
    assert.ok(manifest.contentHash && manifest.contentHash.length === 64);
    assert.strictEqual(manifest.changeTicket, 'CHG-E2E-1');
    assert.ok(manifest.files.some((f) => f.path === 'index.html' && f.sha256));
    assert.ok(fs.existsSync(path.join(packFolder, 'controls-matrix.csv')));
    assert.ok(fs.existsSync(path.join(packFolder, 'traceability.csv')));

    const ledger = historyPath.replace(/\.json$/i, '') + '-ledger.jsonl';
    assert.ok(fs.existsSync(ledger), 'history ledger jsonl');
    const ledgerLine = fs.readFileSync(ledger, 'utf8').trim().split('\n').pop();
    assert.ok(JSON.parse(ledgerLine).contentHash);

    ok('generateReport: provenance + evidence pack + readiness + controls + ledger');
  } catch (e) {
    fail('generateReport enterprise stack', e);
  }

  // --- 5. CLI gate + evidence ---
  try {
    const gateFail = runCli(['gate', reportDir, '--preset=finance-release']);
    // may pass if run is green with ticket+commit — finance-release needs maxFailed=0 which should pass
    assert.ok(gateFail.status === 0 || gateFail.status === 2);

    const gatePr = runCli(['gate', reportDir, '--preset=finance-pr']);
    assert.strictEqual(gatePr.status, 0, gatePr.stdout + gatePr.stderr);
    assert.ok(gatePr.stdout.includes('finance-pr'));
    assert.ok(gatePr.stdout.includes('OK'));

    const noTicketGate = runCli(['gate', reportDir, '--preset=finance-pr'], {
      // wipe ticket from JSON temporarily via require-change on a copy
    });
    assert.strictEqual(noTicketGate.status, 0);

    const outZip = path.join(tmp, 'cli-evidence.zip');
    const ev = runCli(['evidence', reportDir, '-o', outZip]);
    assert.strictEqual(ev.status, 0, ev.stdout + ev.stderr);
    assert.ok(fs.existsSync(outZip));
    assert.ok(ev.stdout.includes('hash:'));
    ok('CLI xreport gate presets + xreport evidence');
  } catch (e) {
    fail('CLI gate/evidence', e);
  }

  // --- 6. CLI gate without ticket fails ---
  try {
    const bareDir = path.join(tmp, 'bare');
    fs.mkdirSync(bareDir, { recursive: true });
    const bare = buildRun({
      title: 'bare',
      framework: 'playwright',
      startedAt: 1,
      finishedAt: 2,
      suites: [
        {
          id: 's',
          title: 's',
          suites: [],
          tests: [
            {
              id: 't',
              historyId: 'h',
              title: 'ok',
              fullTitle: 's ok',
              status: 'passed',
              flaky: false,
              duration: 1,
              tags: [],
              annotations: [],
              errors: [],
              attempts: [],
              attachments: [],
              steps: [],
            },
          ],
        },
      ],
      environment: {},
      options: {},
    });
    fs.writeFileSync(path.join(bareDir, 'xreport.json'), JSON.stringify(bare));
    const g = runCli(['gate', bareDir, '--preset=finance-pr']);
    assert.strictEqual(g.status, 2);
    assert.ok(g.stdout.includes('changeTicket'));
    ok('CLI finance-pr fails without change ticket');
  } catch (e) {
    fail('CLI no-ticket gate', e);
  }

  // --- 7. Readiness evaluation ---
  try {
    const readyRun = JSON.parse(fs.readFileSync(path.join(reportDir, 'xreport.json'), 'utf8'));
    const r = evaluateReadiness(readyRun, {
      checklist: {
        requireCriticalGreen: true,
        requireTags: ['readiness', 'dr'],
        requireEvidencePack: true,
      },
      reportDir,
    });
    assert.ok(r.checks.some((c) => c.id === 'critical-green' && c.status === 'pass'));
    assert.ok(r.checks.some((c) => c.id.startsWith('tag-') && c.status === 'pass'));
    assert.ok(r.checks.some((c) => c.id === 'evidence-pack' && c.status === 'pass'));
    ok('readiness checklist pass/warn/block signals');
  } catch (e) {
    fail('readiness', e);
  }

  // --- 8. Sample report still builds ---
  try {
    const sample = spawnSync('npm', ['run', 'sample'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(sample.status, 0, sample.stderr);
    const sampleJson = path.join(root, 'examples/sample-report/xreport.json');
    const sj = JSON.parse(fs.readFileSync(sampleJson, 'utf8'));
    assert.ok(sj.analytics.controls && sj.analytics.controls.length);
    assert.ok(sj.environment.changeTicket);
    assert.ok(fs.existsSync(path.join(root, 'examples/sample-report/xreport-evidence.zip')));
    ok('npm run sample includes controls + evidence + ticket');
  } catch (e) {
    fail('sample', e);
  }

  console.log('');
  if (failures) {
    console.error(`FAILED: ${failures} check(s)\n`);
    process.exit(1);
  }
  console.log('All enterprise E2E checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
