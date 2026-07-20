/**
 * Generate a rich demo report for XREPORT.
 * Usage: npm run sample
 */
const fs = require('fs');
const path = require('path');
const { buildRun, generateReport, writeJson } = require('../dist');

const mediaDir = path.join(__dirname, 'sample-media');

function dataUri(file) {
  const buf = fs.readFileSync(path.join(mediaDir, file));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const IMG = {
  failure: dataUri('failure.png'),
  passed: dataUri('passed.png'),
  flaky: dataUri('flaky.png'),
};

function shot(name, kind = 'failure') {
  return {
    id: `att-${name}`,
    name,
    type: 'screenshot',
    contentType: 'image/png',
    body: IMG[kind] || IMG.failure,
  };
}

function diffShot(name, kind = 'failure') {
  return {
    id: `att-${name}`,
    name,
    type: 'diff',
    contentType: 'image/png',
    body: IMG[kind] || IMG.failure,
  };
}

const now = Date.now();
const historyPath = path.join(__dirname, '..', '.xreport', 'history.json');

const suites = [
  {
    id: 'suite-checkout',
    title: 'Checkout',
    file: 'tests/checkout.spec.ts',
    suites: [],
    tests: [
      {
        id: 't1',
        historyId: 'hid-checkout-pay',
        title: 'pays with valid card @smoke',
        fullTitle: 'Checkout › pays with valid card @smoke',
        status: 'failed',
        flaky: false,
        duration: 4200,
        file: 'tests/checkout.spec.ts',
        line: 42,
        project: 'chromium',
        tags: ['@smoke', '@payments'],
        attempts: [
          {
            status: 'failed',
            duration: 2100,
            errors: [
              {
                message: 'Timeout 5000ms exceeded.\nwaiting for locator("#pay")',
                stack: 'Error: Timeout\n    at checkout.spec.ts:48',
              },
            ],
            startedAt: now - 12000,
          },
          {
            status: 'failed',
            duration: 2100,
            errors: [
              {
                message: 'Timeout 5000ms exceeded.\nwaiting for locator("#pay")',
                stack: 'Error: Timeout\n    at checkout.spec.ts:48',
              },
            ],
            startedAt: now - 9000,
          },
        ],
        steps: [
          { title: 'Navigate to /checkout', status: 'passed', duration: 320, category: 'test.step' },
          {
            title: 'Fill shipping form',
            status: 'passed',
            duration: 890,
            category: 'test.step',
            steps: [
              { title: 'Fill name', status: 'passed', duration: 120, category: 'pw:api' },
              { title: 'Fill address', status: 'passed', duration: 210, category: 'pw:api' },
              { title: 'Select country', status: 'passed', duration: 180, category: 'pw:api' },
            ],
          },
          {
            title: 'Complete payment',
            status: 'failed',
            duration: 5000,
            category: 'test.step',
            slow: true,
            steps: [
              { title: 'Enter card', status: 'passed', duration: 240, category: 'pw:api' },
              {
                title: 'Click Pay',
                status: 'failed',
                duration: 4600,
                category: 'pw:api',
                error: { message: 'Timeout waiting for #pay' },
                slow: true,
              },
            ],
          },
        ],
        errors: [
          {
            message: 'Timeout 5000ms exceeded.\nwaiting for locator("#pay")',
            stack: 'Error: Timeout\n    at checkout.spec.ts:48',
          },
          {
            message: 'expect(received).toBeVisible()\nReceived element is not visible: #confirm',
            stack: 'Error: expect(received).toBeVisible()\n    at checkout.spec.ts:52',
          },
        ],
        attachments: [
          shot('failure.png', 'failure'),
          diffShot('expected.png', 'passed'),
          diffShot('actual.png', 'failure'),
          {
            id: 'net1',
            name: 'network.har',
            type: 'network',
            contentType: 'application/json',
            body: JSON.stringify({ log: { entries: [{ request: { url: '/api/pay', method: 'POST' }, response: { status: 500 } }] } }, null, 2),
          },
          {
            id: 'dom1',
            name: 'page.dom.html',
            type: 'dom',
            contentType: 'text/html',
            body: '<html><body><button id="pay">Pay</button><div class="error">Payment gateway timeout</div></body></html>',
          },
        ],
        annotations: [
          { type: 'owner', description: 'payments-team' },
          { type: 'severity', description: 'critical' },
          { type: 'tag', description: 'checkout' },
          { type: 'jira', description: 'PAY-1204' },
        ],
        tags: ['@smoke', '@payments', '@checkout'],
        stdout: '[checkout] starting payment flow\n[checkout] card tokenized\n',
        stderr: 'WARN: slow network simulated\n',
        logs: [
          { type: 'stdout', text: '[checkout] starting payment flow\n[checkout] card tokenized\n' },
          { type: 'stderr', text: 'WARN: slow network simulated\n' },
        ],
        owner: 'payments-team',
        severity: 'critical',
        labels: { jira: 'PAY-1204' },
        hooks: [
          { title: 'beforeEach: login', type: 'beforeEach', status: 'passed', duration: 210 },
          { title: 'afterEach: cleanup', type: 'afterEach', status: 'passed', duration: 40 },
        ],
        workerIndex: 0,
        startTime: now - 12000,
        retries: 1,
      },
      {
        id: 't2',
        historyId: 'hid-checkout-coupon',
        title: 'applies coupon @regression',
        fullTitle: 'Checkout › applies coupon @regression',
        status: 'passed',
        flaky: true,
        duration: 1800,
        file: 'tests/checkout.spec.ts',
        line: 70,
        project: 'chromium',
        tags: ['@regression'],
        attempts: [
          {
            status: 'failed',
            duration: 900,
            errors: [{ message: 'Expected discount 10%, got 0%' }],
            startedAt: now - 8000,
          },
          { status: 'passed', duration: 900, errors: [], startedAt: now - 7000 },
        ],
        steps: [
          { title: 'Open cart', status: 'passed', duration: 200 },
          { title: 'Apply SAVE10', status: 'passed', duration: 400 },
        ],
        errors: [],
        attachments: [shot('coupon.png', 'flaky')],
        annotations: [
          { type: 'owner', description: 'growth' },
          { type: 'severity', description: 'normal' },
        ],
        owner: 'growth',
        severity: 'normal',
        workerIndex: 0,
        startTime: now - 8000,
        retries: 1,
        stdout: 'coupon applied\n',
      },
    ],
  },
  {
    id: 'suite-auth',
    title: 'Auth',
    file: 'tests/auth.spec.ts',
    suites: [],
    tests: [
      {
        id: 't3',
        historyId: 'hid-auth-login',
        title: 'logs in with email @smoke',
        fullTitle: 'Auth › logs in with email @smoke',
        status: 'passed',
        flaky: false,
        duration: 650,
        file: 'tests/auth.spec.ts',
        line: 12,
        project: 'firefox',
        tags: ['@smoke'],
        attempts: [{ status: 'passed', duration: 650, errors: [], startedAt: now - 6000 }],
        steps: [
          { title: 'Goto /login', status: 'passed', duration: 120 },
          { title: 'Submit credentials', status: 'passed', duration: 400 },
        ],
        errors: [],
        attachments: [],
        annotations: [{ type: 'owner', description: 'identity' }],
        owner: 'identity',
        severity: 'critical',
        workerIndex: 1,
        startTime: now - 6000,
        retries: 0,
      },
      {
        id: 't4',
        historyId: 'hid-auth-sso',
        title: 'SSO redirect @smoke',
        fullTitle: 'Auth › SSO redirect @smoke',
        status: 'failed',
        flaky: false,
        duration: 3100,
        file: 'tests/auth.spec.ts',
        line: 33,
        project: 'firefox',
        tags: ['@smoke', '@sso'],
        attempts: [
          {
            status: 'failed',
            duration: 3100,
            errors: [
              {
                message: 'Expected URL to contain /dashboard, got /error',
                stack: 'Error: URL\n    at auth.spec.ts:40',
              },
            ],
            startedAt: now - 5000,
          },
        ],
        steps: [
          { title: 'Click Continue with Google', status: 'passed', duration: 180 },
          {
            title: 'Wait for redirect',
            status: 'failed',
            duration: 2800,
            error: { message: 'Wrong URL' },
            slow: true,
          },
        ],
        errors: [
          {
            message: 'Expected URL to contain /dashboard, got /error',
            stack: 'Error: URL\n    at auth.spec.ts:40',
          },
        ],
        attachments: [
          shot('sso-fail.png', 'failure'),
          { id: 'tr1', name: 'trace', type: 'trace', path: 'trace.zip' },
        ],
        annotations: [
          { type: 'owner', description: 'identity' },
          { type: 'severity', description: 'blocker' },
          { type: 'jira', description: 'ID-88' },
        ],
        owner: 'identity',
        severity: 'blocker',
        labels: { jira: 'ID-88' },
        hooks: [{ title: 'beforeAll: seed users', type: 'beforeAll', status: 'passed', duration: 90 }],
        workerIndex: 1,
        startTime: now - 5000,
        retries: 0,
        stderr: 'oauth provider returned 502\n',
      },
      {
        id: 't5',
        historyId: 'hid-auth-logout',
        title: 'logs out',
        fullTitle: 'Auth › logs out',
        status: 'skipped',
        flaky: false,
        duration: 0,
        file: 'tests/auth.spec.ts',
        line: 55,
        project: 'webkit',
        tags: [],
        attempts: [{ status: 'skipped', duration: 0, errors: [] }],
        steps: [],
        errors: [],
        attachments: [],
        annotations: [],
        workerIndex: 2,
        startTime: now - 2000,
        retries: 0,
      },
    ],
  },
  {
    id: 'suite-catalog',
    title: 'Catalog',
    file: 'tests/catalog.spec.ts',
    suites: [],
    tests: [
      {
        id: 't6',
        historyId: 'hid-catalog-search',
        title: 'search returns products',
        fullTitle: 'Catalog › search returns products',
        status: 'passed',
        flaky: false,
        duration: 1100,
        file: 'tests/catalog.spec.ts',
        line: 8,
        project: 'chromium',
        tags: ['@catalog'],
        attempts: [{ status: 'passed', duration: 1100, errors: [], startedAt: now - 4000 }],
        steps: [{ title: 'Type query', status: 'passed', duration: 300 }],
        errors: [],
        attachments: [],
        annotations: [],
        workerIndex: 0,
        startTime: now - 4000,
        retries: 0,
        coverageSummary: { lines: 82, statements: 80, branches: 71, functions: 85 },
      },
      {
        id: 't7',
        historyId: 'hid-catalog-filter',
        title: 'filters by price',
        fullTitle: 'Catalog › filters by price',
        status: 'timedOut',
        flaky: false,
        duration: 30000,
        file: 'tests/catalog.spec.ts',
        line: 22,
        project: 'webkit',
        tags: ['@catalog'],
        attempts: [
          {
            status: 'timedOut',
            duration: 30000,
            errors: [{ message: 'Test timeout of 30000ms exceeded.' }],
            startedAt: now - 35000,
          },
        ],
        steps: [
          { title: 'Open filters', status: 'passed', duration: 200 },
          { title: 'Drag price slider', status: 'timedOut', duration: 29800, slow: true },
        ],
        errors: [{ message: 'Test timeout of 30000ms exceeded.' }],
        attachments: [shot('timeout.png', 'failure')],
        annotations: [{ type: 'severity', description: 'minor' }],
        severity: 'minor',
        workerIndex: 2,
        startTime: now - 35000,
        retries: 0,
        stdout: 'filter panel opened\n',
      },
    ],
  },
];

async function main() {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  writeJson(historyPath, {
    version: 1,
    // newest first (matches HistoryStore convention)
    records: [5, 4, 3, 2, 1, 0].map((i) => ({
      id: `h${i}`,
      date: now - (6 - i) * 86400000,
      framework: 'playwright',
      title: i % 2 ? 'CI run · staging' : 'Local sample run',
      summary: {
        total: 7,
        passed: 4 + (i % 2),
        failed: 1,
        skipped: 1,
        pending: 0,
        timedOut: i % 2,
        flaky: i % 3 === 0 ? 1 : 0,
        duration: 45000 - i * 1000,
      },
      environment: {
        branch: i % 2 ? 'staging' : 'main',
        browser: i % 3 === 0 ? 'chromium' : i % 3 === 1 ? 'firefox' : 'webkit',
        ci: i % 2 === 1,
      },
      failedIds: ['hid-checkout-pay', i > 3 ? 'hid-catalog-filter' : 'hid-old'],
      passedIds: ['hid-auth-login', 'hid-auth-sso', 'hid-catalog-search', 'hid-checkout-coupon'],
      tests: [
        { historyId: 'hid-checkout-pay', title: 'Checkout › pays with valid card', status: i > 2 ? 'failed' : 'passed', duration: 4000 },
        { historyId: 'hid-checkout-coupon', title: 'Checkout › applies coupon', status: i % 3 === 0 ? 'failed' : 'passed', duration: 1800 },
        { historyId: 'hid-auth-login', title: 'Auth › logs in with email', status: 'passed', duration: 650 },
        { historyId: 'hid-auth-sso', title: 'Auth › SSO redirect', status: i > 4 ? 'failed' : 'passed', duration: 3000 },
        { historyId: 'hid-catalog-search', title: 'Catalog › search', status: 'passed', duration: 1100 },
        { historyId: 'hid-catalog-filter', title: 'Catalog › filters by price', status: i > 3 ? 'timedOut' : 'passed', duration: 28000 },
        { historyId: 'hid-auth-logout', title: 'Auth › logs out', status: 'skipped', duration: 0 },
      ],
    })),
  });

  const reportDir = path.join(__dirname, '..', 'examples', 'sample-report');

  const run = buildRun({
    title: 'XREPORT Sample · Dashboard Demo',
    framework: 'playwright',
    startedAt: now - 40000,
    finishedAt: now,
    suites,
    options: {
      reportDir,
      reportTitle: 'XREPORT Sample · Dashboard Demo',
      enableHistory: true,
      historyOptions: { dbPath: historyPath, saveFullResults: true },
      exportCSV: true,
      exportCtrf: true,
      branding: {
        projectName: 'XREPORT',
        companyName: 'XQA',
        accentColor: '#0071E3',
        website: 'https://xqa.io',
      },
    },
    environment: {
      os: 'darwin',
      node: process.version,
      browser: 'chromium / firefox / webkit',
      baseURL: 'https://xqa.io/practice',
      ci: false,
      branch: 'main',
    },
  });

  run.coverageSummary = { lines: 82, statements: 80, branches: 71, functions: 85 };

  const result = await generateReport(run, {
    reportDir,
    reportTitle: run.title,
    enableHistory: true,
    historyOptions: { dbPath: historyPath, saveFullResults: true },
    exportCSV: true,
    exportCtrf: true,
    autoOpen: false,
    quiet: false,
    branding: run.branding,
  });

  console.log('Sample report written:', result.htmlPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
