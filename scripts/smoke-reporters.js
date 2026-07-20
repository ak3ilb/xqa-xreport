/**
 * Smoke-check Jest / Vitest / Cypress reporters without installing those frameworks.
 * Run: npm run smoke:reporters
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const JestReporter = require('../dist/reporters/jest.js');
const VitestReporter = require('../dist/reporters/vitest.js');
const { setupXReport } = require('../dist/reporters/cypress.js');
const { attach, clearKeyedContext } = require('../dist/context/index.js');

function assertHtml(dir, label) {
  const html = path.join(dir, 'index.html');
  if (!fs.existsSync(html)) throw new Error(`${label}: missing ${html}`);
  const json = path.join(dir, 'xreport.json');
  if (!fs.existsSync(json)) throw new Error(`${label}: missing ${json}`);
  const data = JSON.parse(fs.readFileSync(json, 'utf8'));
  const size = fs.statSync(html).size;
  if (size < 1000) throw new Error(`${label}: HTML too small (${size})`);
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
  });
  await new Promise((r) => setTimeout(r, 250));
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
  ]);
  await new Promise((r) => setTimeout(r, 250));
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

(async () => {
  console.log('XREPORT reporter smoke…');
  await smokeJest();
  await smokeVitest();
  await smokeCypress();
  console.log('All reporter smokes passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
