#!/usr/bin/env node
'use strict';

/**
 * Hourly CI smoke against https://xqa.io/practice
 *
 * Each invocation:
 *  - picks ONE random practice page (or XREPORT_CI_PAGE)
 *  - picks ONE framework (or XREPORT_CI_FRAMEWORK)
 *  - scaffolds a fresh temp project
 *  - npm installs @xqa.io/xreport@latest (+ framework deps)
 *  - runs a single small browser test for that page only
 *  - asserts XREPORT HTML/JSON were written
 *
 * Mocha / Jest / Vitest drive Chromium via Playwright (same page checks).
 * Cypress uses native cy.visit.
 *
 * Env:
 *   XREPORT_CI_FRAMEWORK  — playwright|cypress|jest|vitest|mocha
 *   XREPORT_CI_PAGE       — practice page id (e.g. practice-form)
 *   XREPORT_CI_SLOT       — unique suffix for parallel matrix jobs
 *   RUNNER_TEMP / GITHUB_WORKSPACE
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const FRAMEWORKS = ['playwright', 'cypress', 'jest', 'vitest', 'mocha'];
const ACCENTS = ['#0071E3', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5856D6'];

const repoRoot = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const runnerTemp = process.env.RUNNER_TEMP || os.tmpdir();
const slot = String(process.env.XREPORT_CI_SLOT || '0').replace(/[^a-zA-Z0-9_-]/g, '');
const workdir = path.join(runnerTemp, `xreport-hourly-${slot}`);
const reportDir = path.join(workdir, 'xreport');
const pagesPath = path.join(repoRoot, 'scripts/ci/practice-pages.json');

function log(msg) {
  console.log(`[ci-hourly] ${msg}`);
}

function fail(msg) {
  console.error(`[ci-hourly] ERROR: ${msg}`);
  process.exit(1);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function loadPages() {
  if (!fs.existsSync(pagesPath)) fail(`Missing practice page catalog: ${pagesPath}`);
  const pages = JSON.parse(fs.readFileSync(pagesPath, 'utf8'));
  if (!Array.isArray(pages) || pages.length === 0) fail('Practice page catalog is empty');
  return pages;
}

function pickFramework() {
  const pinned = (process.env.XREPORT_CI_FRAMEWORK || '').trim().toLowerCase();
  if (pinned) {
    if (!FRAMEWORKS.includes(pinned)) fail(`Unknown framework "${pinned}"`);
    return pinned;
  }
  return pick(FRAMEWORKS);
}

function pickPage(pages) {
  const pinned = (process.env.XREPORT_CI_PAGE || '').trim().toLowerCase();
  if (pinned) {
    const hit = pages.find((p) => p.id === pinned);
    if (!hit) fail(`Unknown practice page "${pinned}"`);
    return hit;
  }
  return pick(pages);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function write(file, contents) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, contents, 'utf8');
}

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd || workdir,
    env: { ...process.env, ...(opts.env || {}) },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return res.status === null ? 1 : res.status;
}

function buildRunMeta(framework, page) {
  const seed = crypto.randomBytes(4).toString('hex');
  const accent = pick(ACCENTS);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    seed,
    accent,
    stamp,
    framework,
    pageId: page.id,
    pageName: page.name,
    pageUrl: page.url,
    reportTitle: `XQA Practice · ${page.name} · ${framework} · ${stamp}`,
    expectFail: Math.random() < 0.15,
  };
}

function reporterOptions(meta) {
  return {
    reportTitle: meta.reportTitle,
    reportDir: './xreport',
    exportCSV: true,
    exportCtrf: true,
    autoOpen: false,
    enableHistory: false,
    branding: {
      projectName: 'XREPORT',
      companyName: 'XQA',
      website: 'https://xqa.io/practice',
      accentColor: meta.accent,
    },
  };
}

function scaffoldBase(deps) {
  rmrf(workdir);
  mkdirp(workdir);
  write(
    path.join(workdir, 'package.json'),
    JSON.stringify(
      {
        name: 'xreport-hourly-practice',
        private: true,
        version: '0.0.0',
        description: 'Ephemeral hourly XQA practice smoke for @xqa.io/xreport',
      },
      null,
      2
    )
  );
  const code = run('npm', ['install', '--no-package-lock', '--no-save', ...deps]);
  if (code !== 0) fail(`npm install failed (exit ${code})`);
}

function installChromium() {
  const code = run('npx', ['playwright', 'install', '--with-deps', 'chromium']);
  if (code !== 0) fail(`playwright install chromium failed (exit ${code})`);
}

/** Shared browser smoke used by mocha/jest/vitest (Playwright library). */
function playwrightLibraryTestSource(meta) {
  const url = JSON.stringify(meta.pageUrl);
  return `const { chromium } = require('playwright');

async function openPracticePage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'XREPORT-Hourly-CI/' + ${JSON.stringify(meta.seed)} + ' (+https://xqa.io)',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const response = await page.goto(${url}, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const status = response ? response.status() : 0;
  const title = await page.title();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  await browser.close();
  return { status, title, bodyText, url: ${url} };
}

module.exports = {
  openPracticePage,
  EXPECT_FAIL: ${meta.expectFail ? 'true' : 'false'},
  PAGE_NAME: ${JSON.stringify(meta.pageName)},
  PAGE_ID: ${JSON.stringify(meta.pageId)},
  SEED: ${JSON.stringify(meta.seed)},
};
`;
}

function scaffoldMocha(meta) {
  scaffoldBase(['@xqa.io/xreport@latest', 'mocha', 'playwright']);
  installChromium();
  write(path.join(workdir, 'practice-lib.js'), playwrightLibraryTestSource(meta));
  write(
    path.join(workdir, '.mocharc.json'),
    JSON.stringify(
      {
        reporter: '@xqa.io/xreport/mocha',
        reporterOptions: reporterOptions(meta),
        timeout: 90000,
        spec: ['test/**/*.js'],
      },
      null,
      2
    )
  );
  write(
    path.join(workdir, 'test/practice.one.test.js'),
    `const assert = require('assert');
const { attach } = require('@xqa.io/xreport/context');
const { openPracticePage, EXPECT_FAIL, PAGE_NAME, PAGE_ID, SEED } = require('../practice-lib');

describe('XQA practice · ' + PAGE_NAME, function () {
  it('loads the practice page @smoke', async function () {
    const { status, title, bodyText, url } = await openPracticePage();
    attach(this, { type: 'json', title: 'practice-target', value: { url, page: PAGE_ID, status, title, seed: SEED } });
    assert.ok(status >= 200 && status < 400, 'HTTP status ' + status);
    assert.ok(/xqa|practice/i.test(title + bodyText), 'expected XQA/practice content');
    if (EXPECT_FAIL) {
      assert.fail('Intentional random demo failure (15% of hourly runs)');
    }
  });
});
`
  );
}

function scaffoldJest(meta) {
  scaffoldBase(['@xqa.io/xreport@latest', 'jest', 'playwright']);
  installChromium();
  write(path.join(workdir, 'practice-lib.js'), playwrightLibraryTestSource(meta));
  write(
    path.join(workdir, 'jest.config.js'),
    `/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/practice.one.test.js'],
  testTimeout: 90000,
  reporters: [
    'default',
    ['@xqa.io/xreport/jest', ${JSON.stringify(reporterOptions(meta), null, 2)}],
  ],
};
`
  );
  write(
    path.join(workdir, 'practice.one.test.js'),
    `const { attach } = require('@xqa.io/xreport/context');
const { openPracticePage, EXPECT_FAIL, PAGE_NAME, PAGE_ID, SEED } = require('./practice-lib');

describe('XQA practice · ' + PAGE_NAME, () => {
  it('loads the practice page @smoke', async () => {
    const { status, title, bodyText, url } = await openPracticePage();
    attach.note({ type: 'json', title: 'practice-target', value: { url, page: PAGE_ID, status, title, seed: SEED } });
    attach.meta({ owner: 'xqa-practice', severity: 'medium', labels: { page: PAGE_ID } });
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(400);
    expect(title + bodyText).toMatch(/xqa|practice/i);
    if (EXPECT_FAIL) {
      expect('intentional').toBe('failure');
    }
  });
});
`
  );
}

function scaffoldVitest(meta) {
  scaffoldBase(['@xqa.io/xreport@latest', 'vitest', 'typescript', 'playwright']);
  installChromium();
  write(path.join(workdir, 'practice-lib.js'), playwrightLibraryTestSource(meta));
  write(
    path.join(workdir, 'vitest.config.ts'),
    `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 90000,
    include: ['practice.one.test.ts'],
    reporters: [
      'default',
      ['@xqa.io/xreport/vitest', ${JSON.stringify(reporterOptions(meta), null, 8)}],
    ],
  },
});
`
  );
  write(
    path.join(workdir, 'practice.one.test.ts'),
    `import { describe, it, expect } from 'vitest';
import { attach } from '@xqa.io/xreport/context';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { openPracticePage, EXPECT_FAIL, PAGE_NAME, PAGE_ID, SEED } = require('./practice-lib');

describe('XQA practice · ' + PAGE_NAME, () => {
  it('loads the practice page @smoke', async () => {
    const { status, title, bodyText, url } = await openPracticePage();
    attach.note({ type: 'json', title: 'practice-target', value: { url, page: PAGE_ID, status, title, seed: SEED } });
    attach.meta({ owner: 'xqa-practice', severity: 'medium', labels: { page: PAGE_ID } });
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(400);
    expect(title + bodyText).toMatch(/xqa|practice/i);
    if (EXPECT_FAIL) {
      expect('intentional').toBe('failure');
    }
  });
});
`
  );
}

function scaffoldPlaywright(meta) {
  scaffoldBase(['@xqa.io/xreport@latest', '@playwright/test']);
  installChromium();
  write(
    path.join(workdir, 'playwright.config.ts'),
    `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90000,
  reporter: [
    ['list'],
    ['@xqa.io/xreport/playwright', ${JSON.stringify(reporterOptions(meta), null, 6)}],
  ],
  use: {
    headless: true,
    userAgent: ${JSON.stringify(`XREPORT-Hourly-CI/${meta.seed} (+https://xqa.io)`)},
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
`
  );
  write(
    path.join(workdir, 'tests/practice.one.spec.ts'),
    `import { test, expect } from '@playwright/test';

const PAGE_URL = ${JSON.stringify(meta.pageUrl)};
const PAGE_NAME = ${JSON.stringify(meta.pageName)};
const EXPECT_FAIL = ${meta.expectFail ? 'true' : 'false'};

test.describe('XQA practice · ' + PAGE_NAME, () => {
  test('loads the practice page @smoke', async ({ page }, testInfo) => {
    const response = await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
    const status = response ? response.status() : 0;
    await testInfo.attach('practice-target.json', {
      body: Buffer.from(JSON.stringify({ url: PAGE_URL, name: PAGE_NAME, status, seed: ${JSON.stringify(meta.seed)} }, null, 2)),
      contentType: 'application/json',
    });
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
    const title = await page.title();
    const body = await page.locator('body').innerText();
    expect(title + body).toMatch(/xqa|practice/i);
    if (EXPECT_FAIL) {
      expect(true, 'Intentional random demo failure').toBe(false);
    }
  });
});
`
  );
}

function scaffoldCypress(meta) {
  scaffoldBase(['@xqa.io/xreport@latest', 'cypress', 'typescript']);
  write(
    path.join(workdir, 'cypress.config.ts'),
    `import { defineConfig } from 'cypress';
import { setupXReport } from '@xqa.io/xreport/cypress';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      setupXReport(on, config, ${JSON.stringify(reporterOptions(meta), null, 8)});
      return config;
    },
    screenshotOnRunFailure: true,
    video: false,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 60000,
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/practice.one.cy.js',
    userAgent: ${JSON.stringify(`XREPORT-Hourly-CI/${meta.seed} (+https://xqa.io)`)},
  },
});
`
  );
  write(
    path.join(workdir, 'cypress/support/e2e.js'),
    `import { registerXReportCypress } from '@xqa.io/xreport/cypress/support';
registerXReportCypress();
`
  );
  write(
    path.join(workdir, 'cypress/e2e/practice.one.cy.js'),
    `const PAGE_URL = ${JSON.stringify(meta.pageUrl)};
const PAGE_NAME = ${JSON.stringify(meta.pageName)};
const EXPECT_FAIL = ${meta.expectFail ? 'true' : 'false'};

describe('XQA practice · ' + PAGE_NAME, () => {
  it('loads the practice page @smoke', () => {
    cy.xreportMeta({
      owner: 'xqa-practice',
      severity: 'medium',
      labels: { page: ${JSON.stringify(meta.pageId)}, framework: 'cypress' },
    });
    cy.visit(PAGE_URL);
    cy.xreportNote({ url: PAGE_URL, name: PAGE_NAME, seed: ${JSON.stringify(meta.seed)} }, 'practice-target');
    cy.get('body').should('be.visible');
    cy.title().should('match', /xqa|practice/i);
    cy.document().its('body.innerText').should('match', /xqa|practice/i);
    if (EXPECT_FAIL) {
      expect(true, 'Intentional random demo failure').to.eq(false);
    }
  });
});
`
  );
}

function runFramework(fw) {
  switch (fw) {
    case 'mocha':
      return run('npx', ['mocha']);
    case 'jest':
      return run('npx', ['jest', '--ci']);
    case 'vitest':
      return run('npx', ['vitest', 'run']);
    case 'playwright':
      return run('npx', ['playwright', 'test']);
    case 'cypress':
      return run('npx', ['cypress', 'run']);
    default:
      fail(`No runner for ${fw}`);
  }
}

function assertReport() {
  const html = path.join(reportDir, 'index.html');
  const json = path.join(reportDir, 'xreport.json');
  if (!fs.existsSync(html)) fail(`Missing report HTML: ${html}`);
  if (!fs.existsSync(json)) fail(`Missing report JSON: ${json}`);
  const size = fs.statSync(html).size;
  if (size < 100) fail(`Report HTML too small (${size} bytes)`);
  log(`Report OK: ${html} (${size} bytes)`);
  log(`Report OK: ${json}`);
}

function main() {
  const pages = loadPages();
  const framework = pickFramework();
  const page = pickPage(pages);
  const meta = buildRunMeta(framework, page);

  log(`Framework: ${framework}`);
  log(`Practice page: ${page.id} (${page.url})`);
  log(`Seed: ${meta.seed} accent=${meta.accent} expectFail=${meta.expectFail}`);
  log(`Workdir: ${workdir}`);

  switch (framework) {
    case 'mocha':
      scaffoldMocha(meta);
      break;
    case 'jest':
      scaffoldJest(meta);
      break;
    case 'vitest':
      scaffoldVitest(meta);
      break;
    case 'playwright':
      scaffoldPlaywright(meta);
      break;
    case 'cypress':
      scaffoldCypress(meta);
      break;
    default:
      fail(`Unhandled framework ${framework}`);
  }

  const status = runFramework(framework);
  log(`Test command finished with exit ${status} (demo failures allowed when expectFail)`);

  assertReport();

  write(path.join(workdir, 'framework.txt'), `${framework}\n`);
  write(path.join(workdir, 'page.txt'), `${page.id}\n`);
  write(path.join(workdir, 'meta.json'), JSON.stringify(meta, null, 2));

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `## XREPORT hourly practice sample`,
        ``,
        `- Framework: **${framework}**`,
        `- Practice page: **[${page.name}](${page.url})** (\`${page.id}\`)`,
        `- Package: \`@xqa.io/xreport@latest\` (npm install)`,
        `- Seed: \`${meta.seed}\``,
        `- Intentional fail: ${meta.expectFail}`,
        `- Report: \`xreport/index.html\``,
        ``,
      ].join('\n')
    );
  }

  log('Done.');
}

main();
