/**
 * Smoke-check reporters without installing frameworks (mocked events).
 * Run: npm run smoke:reporters
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const JestReporter = require('../dist/reporters/jest.js');
const VitestReporter = require('../dist/reporters/vitest.js');
const MochaReporter = require('../dist/reporters/mocha.js');
const JasmineReporter = require('../dist/reporters/jasmine.js');
const PlaywrightMod = require('../dist/reporters/playwright.js');
const PlaywrightReporter = PlaywrightMod.default || PlaywrightMod;
const WebdriverIOMod = require('../dist/reporters/webdriverio.js');
const WebdriverIOReporter = WebdriverIOMod.default || WebdriverIOMod;
const { setupXReport } = require('../dist/reporters/cypress.js');
const { attach, clearKeyedContext } = require('../dist/context/index.js');
const { toCtrf } = require('../dist/core/ctrf.js');
const { applyKnownIssues } = require('../dist/core/known-issues.js');
const { evaluateQualityGate } = require('../dist/core/quality-gate.js');

function assertHtml(dir, label) {
  const html = path.join(dir, 'index.html');
  if (!fs.existsSync(html)) throw new Error(`${label}: missing ${html}`);
  const json = path.join(dir, 'xreport.json');
  if (!fs.existsSync(json)) throw new Error(`${label}: missing ${json}`);
  const data = JSON.parse(fs.readFileSync(json, 'utf8'));
  const size = fs.statSync(html).size;
  if (size < 1000) throw new Error(`${label}: HTML too small (${size})`);
  if (!fs.existsSync(path.join(dir, 'ai-context.json'))) {
    throw new Error(`${label}: missing ai-context.json`);
  }
  if (!fs.existsSync(path.join(dir, 'ctrf-report.json'))) {
    throw new Error(`${label}: missing ctrf-report.json`);
  }
  console.log(`  OK ${label} → ${html} (${size} bytes)`);
  return data;
}

function walk(suite, acc = []) {
  for (const t of suite.tests || []) acc.push(t);
  for (const s of suite.suites || []) walk(s, acc);
  return acc;
}

async function smokeJest() {
  clearKeyedContext();
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-jest-'));
  const fullName = 'math divides by zero @unit';
  attach.to(fullName, { type: 'json', title: 'debug', value: { n: 0 } });
  attach.meta(fullName, { owner: 'platform', severity: 'high' });
  attach.steps(fullName, [
    { title: 'arrange', status: 'passed', duration: 1, category: 'test.step' },
  ]);

  const reporter = new JestReporter(
    {},
    { reportDir, reportTitle: 'Jest smoke', autoOpen: false, quiet: true },
  );
  reporter.onRunStart();
  await Promise.resolve(
    reporter.onRunComplete(null, {
    startTime: Date.now() - 1200,
    testResults: [
      {
        testFilePath: path.join(process.cwd(), 'tests/math.test.js'),
        testResults: [
          {
            title: 'adds numbers @unit',
            fullName: 'math adds numbers @unit',
            status: 'passed',
            duration: 12,
            ancestorTitles: ['math'],
            failureMessages: [],
          },
          {
            title: 'divides by zero @unit',
            fullName,
            status: 'failed',
            duration: 8,
            ancestorTitles: ['math'],
            failureMessages: ['Error: expected Infinity\n    at Object.<anonymous>'],
            location: { line: 10 },
          },
        ],
      },
    ],
  }),
  );
  const data = assertHtml(reportDir, 'jest');
  const tests = data.suites.flatMap((s) => walk(s));
  const failed = tests.find((t) => t.title.includes('divides'));
  if (!failed?.owner) throw new Error('jest: expected owner from attach.meta');
  if (!(failed.attachments || []).length) throw new Error('jest: expected keyed attachment');
  if (!(failed.steps || []).length) throw new Error('jest: expected steps');
}

async function smokeVitest() {
  clearKeyedContext();
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-vitest-'));
  const fullTitle = 'sum › handles NaN @unit';
  attach.to(fullTitle, { type: 'text', title: 'hint', value: 'NaN path' });
  attach.meta(fullTitle, { owner: 'data', severity: 'medium' });

  const reporter = new VitestReporter({
    reportDir,
    reportTitle: 'Vitest smoke',
    autoOpen: false,
    quiet: true,
  });
  reporter.onInit();
  await Promise.resolve(
    reporter.onFinished([
    {
      filepath: path.join(process.cwd(), 'src/sum.test.ts'),
      tasks: [
        {
          type: 'suite',
          name: 'sum',
          tasks: [
            {
              type: 'test',
              name: 'returns sum @unit',
              result: { state: 'pass', duration: 3, errors: [] },
            },
            {
              type: 'test',
              name: 'handles NaN @unit',
              meta: { jira: 'VT-1' },
              result: {
                state: 'fail',
                duration: 5,
                errors: [{ message: 'expected NaN to be 0', stack: 'Error: expected…' }],
              },
              location: { line: 14 },
            },
          ],
        },
      ],
    },
  ]),
  );
  const data = assertHtml(reportDir, 'vitest');
  const tests = data.suites.flatMap((s) => walk(s));
  const failed = tests.find((t) => t.title.includes('NaN'));
  if (failed?.owner !== 'data') throw new Error('vitest: expected owner');
  if (!(failed.labels && failed.labels.jira === 'VT-1')) {
    throw new Error('vitest: expected meta.jira label');
  }
}

async function smokeCypress() {
  clearKeyedContext();
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-cypress-'));
  const handlers = {};
  const on = (event, fn) => {
    handlers[event] = fn;
  };
  setupXReport(on, {}, { reportDir, reportTitle: 'Cypress smoke', autoOpen: false, quiet: true });

  // Simulate support file tasks
  handlers.task['xreport:meta']({
    key: 'Auth › rejects bad password @smoke',
    meta: { owner: 'identity', severity: 'high' },
  });
  handlers.task['xreport:steps']({
    key: 'Auth › rejects bad password @smoke',
    steps: [
      { title: 'visit', status: 'passed', duration: 40, category: 'cy:command' },
      { title: 'get h1', status: 'failed', duration: 10, category: 'cy:command' },
    ],
  });
  handlers.task['xreport:attach']({
    key: 'Auth › rejects bad password @smoke',
    attachment: { type: 'json', title: 'body', value: { status: 401 } },
  });

  await handlers['after:run']({
    totalDuration: 2400,
    browserName: 'chrome',
    startedTestsAt: new Date(Date.now() - 2400).toISOString(),
    endedTestsAt: new Date().toISOString(),
    runs: [
      {
        spec: { relative: 'cypress/e2e/login.cy.js', name: 'login.cy.js' },
        video: null,
        tests: [
          {
            title: ['Auth', 'logs in @smoke'],
            state: 'passed',
            duration: 900,
            attempts: [{ state: 'passed', duration: 900 }],
          },
          {
            title: ['Auth', 'rejects bad password @smoke'],
            state: 'failed',
            duration: 1100,
            displayError: 'AssertionError: expected 401 to equal 200',
            attempts: [
              {
                state: 'failed',
                duration: 1100,
                error: { message: 'AssertionError: expected 401 to equal 200', stack: 'Error…' },
              },
            ],
          },
        ],
        screenshots: [],
      },
    ],
  });
  await new Promise((r) => setTimeout(r, 250));
  const data = assertHtml(reportDir, 'cypress');
  const tests = data.suites.flatMap((s) => walk(s));
  const failed = tests.find((t) => t.title.includes('rejects'));
  if (failed?.owner !== 'identity') throw new Error('cypress: expected owner from task');
  if (!(failed.steps || []).length) throw new Error('cypress: expected command steps');
  if (!(failed.attachments || []).length) throw new Error('cypress: expected note attachment');
}

async function smokeMocha() {
  clearKeyedContext();
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-mocha-'));
  const events = {};
  const runner = {
    on(ev, fn) {
      events[ev] = fn;
    },
  };
  // eslint-disable-next-line no-new
  new MochaReporter(runner, {
    reporterOptions: { reportDir, reportTitle: 'Mocha smoke', autoOpen: false, quiet: true },
  });
  events.suite({ title: 'math', file: 'math.test.js' });
  events['test end']({
    title: 'adds',
    fullTitle: () => 'math adds',
    state: 'passed',
    duration: 4,
    file: 'math.test.js',
    pending: false,
  });
  events['test end']({
    title: 'fails',
    fullTitle: () => 'math fails',
    state: 'failed',
    duration: 6,
    file: 'math.test.js',
    pending: false,
    err: { message: 'expected 1 to equal 2', stack: 'Error' },
  });
  await Promise.resolve(events.end());
  await new Promise((r) => setTimeout(r, 400));
  const data = assertHtml(reportDir, 'mocha');
  const tests = data.suites.flatMap((s) => walk(s));
  if (tests.length < 2) throw new Error('mocha: expected tests');
}

async function smokeJasmine() {
  clearKeyedContext();
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-jasmine-'));
  const reporter = new JasmineReporter({
    reportDir,
    reportTitle: 'Jasmine smoke',
    autoOpen: false,
    quiet: true,
  });
  reporter.jasmineStarted();
  reporter.suiteStarted({ description: 'calc' });
  reporter.specDone({
    description: 'works',
    fullName: 'calc works',
    status: 'passed',
    duration: 3,
    failedExpectations: [],
  });
  reporter.specDone({
    description: 'breaks',
    fullName: 'calc breaks',
    status: 'failed',
    duration: 5,
    failedExpectations: [{ message: 'Expected true to be false.', stack: 'Error' }],
  });
  reporter.suiteDone();
  await Promise.resolve(reporter.jasmineDone());
  await new Promise((r) => setTimeout(r, 400));
  assertHtml(reportDir, 'jasmine');
}

async function smokePlaywright() {
  clearKeyedContext();
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-pw-'));
  const reporter = new PlaywrightReporter({
    reportDir,
    reportTitle: 'Playwright smoke',
    autoOpen: false,
    quiet: true,
  });
  const file = path.join(process.cwd(), 'tests/demo.spec.ts');
  const suite = {
    title: '',
    suites: [
      {
        title: 'demo',
        suites: [],
        tests: [
          {
            id: 'pw-pass',
            title: 'passes @smoke',
            titlePath: () => ['', 'demo', 'passes @smoke'],
            location: { file, line: 4 },
            tags: ['@smoke'],
            annotations: [{ type: 'owner', description: 'qa' }],
            results: [
              {
                status: 'passed',
                duration: 12,
                errors: [],
                attachments: [],
                steps: [],
                stdout: [],
                stderr: [],
                workerIndex: 0,
                startTime: new Date().toISOString(),
              },
            ],
            outcome: () => 'expected',
            ok: () => true,
          },
          {
            id: 'pw-fail',
            title: 'fails @smoke',
            titlePath: () => ['', 'demo', 'fails @smoke'],
            location: { file, line: 10 },
            tags: ['@smoke'],
            annotations: [],
            results: [
              {
                status: 'failed',
                duration: 20,
                errors: [{ message: 'Timeout waiting for locator', stack: 'Error\n at demo.spec.ts:10' }],
                attachments: [],
                steps: [{ title: 'Click', category: 'pw:api', duration: 5 }],
                stdout: [],
                stderr: [],
                workerIndex: 0,
                startTime: new Date().toISOString(),
              },
            ],
            outcome: () => 'unexpected',
            ok: () => false,
          },
        ],
      },
    ],
    tests: [],
    allTests() {
      return this.suites.flatMap((s) => s.tests);
    },
  };
  reporter.onBegin({}, suite);
  for (const t of suite.allTests()) {
    reporter.onTestEnd(t, t.results[0]);
  }
  await reporter.onEnd({ status: 'failed' });
  await new Promise((r) => setTimeout(r, 200));
  const data = assertHtml(reportDir, 'playwright');
  const tests = data.suites.flatMap((s) => walk(s));
  const failed = tests.find((t) => t.title.includes('fails'));
  if (!failed?.defectKind) throw new Error('playwright: expected defectKind on failure');
}

async function smokeWdio() {
  clearKeyedContext();
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-wdio-'));
  const reporter = new WebdriverIOReporter({
    reportDir,
    reportTitle: 'WDIO smoke',
    autoOpen: false,
    quiet: true,
  });
  reporter.onRunnerStart();
  reporter.onSuiteStart({ title: 'login', file: 'login.js' });
  reporter.onTestStart({ title: 'ok @smoke', fullTitle: 'login ok @smoke' });
  reporter.onTestPass({ duration: 15 });
  reporter.onTestStart({ title: 'bad @smoke', fullTitle: 'login bad @smoke' });
  reporter.onTestFail({
    duration: 22,
    error: { message: 'element not found', stack: 'Error' },
  });
  reporter.onSuiteEnd();
  await Promise.resolve(reporter.onRunnerEnd());
  await new Promise((r) => setTimeout(r, 500));
  assertHtml(reportDir, 'webdriverio');
}

async function smokeCtrfAndGate() {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xreport-gate-'));
  const ki = path.join(reportDir, 'known-issues.json');
  fs.writeFileSync(
    ki,
    JSON.stringify({
      version: 1,
      issues: [
        {
          id: 'KI-TIMEOUT',
          reason: 'known locator flake',
          mute: true,
          match: { signatureContains: 'timeout waiting' },
        },
      ],
    }),
    'utf8',
  );
  const reporter = new PlaywrightReporter({
    reportDir,
    reportTitle: 'Gate smoke',
    autoOpen: false,
    quiet: true,
    knownIssuesPath: ki,
  });
  const file = 'a.spec.ts';
  const suite = {
    title: '',
    suites: [
      {
        title: 's',
        suites: [],
        tests: [
          {
            id: 'g1',
            title: 't',
            titlePath: () => ['', 's', 't'],
            location: { file, line: 1 },
            tags: [],
            annotations: [],
            results: [
              {
                status: 'failed',
                duration: 1,
                errors: [{ message: 'Timeout waiting for locator', stack: 'Error' }],
                attachments: [],
                steps: [],
                stdout: [],
                stderr: [],
              },
            ],
            outcome: () => 'unexpected',
            ok: () => false,
          },
        ],
      },
    ],
    tests: [],
    allTests() {
      return this.suites.flatMap((s) => s.tests);
    },
  };
  reporter.onBegin({}, suite);
  for (const t of suite.allTests()) reporter.onTestEnd(t, t.results[0]);
  await reporter.onEnd({ status: 'failed' });
  await new Promise((r) => setTimeout(r, 300));
  let run = JSON.parse(fs.readFileSync(path.join(reportDir, 'xreport.json'), 'utf8'));
  run = applyKnownIssues(run, ki);
  const muted = run.suites.flatMap((s) => walk(s)).find((t) => t.muted);
  if (!muted) throw new Error('gate: expected muted known issue');
  const gate = evaluateQualityGate(run, { maxFailed: 0 });
  if (!gate.ok) throw new Error('gate: muted failure should pass maxFailed=0');
  const ctrf = toCtrf(run);
  if (!ctrf.results?.summary) throw new Error('ctrf: missing summary');
  console.log('  OK known-issues + quality-gate + ctrf');
}

(async () => {
  console.log('XREPORT reporter smoke…');
  await smokeJest();
  await smokeVitest();
  await smokeCypress();
  await smokeMocha();
  await smokeJasmine();
  await smokePlaywright();
  await smokeWdio();
  await smokeCtrfAndGate();
  console.log('All reporter smokes passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
