# XREPORT by XQA — All-in-One HTML Test Reporter for Playwright, WebdriverIO, Jasmine, Cypress, Jest, Vitest & Mocha

[![npm version](https://img.shields.io/npm/v/@xqa.io/xreport.svg)](https://www.npmjs.com/package/@xqa.io/xreport)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-blue)](https://www.typescriptlang.org/)
[![GitHub](https://img.shields.io/badge/GitHub-ak3ilb%2Fxqa--xreport-181717?logo=github)](https://github.com/ak3ilb/xqa-xreport)
[![XQA](https://img.shields.io/badge/XQA-xqa.io-0071E3)](https://xqa.io)

**XREPORT** by [**XQA**](https://xqa.io) — one local HTML reporter for every major JS test stack. **Playwright HTML reporter**, **WebdriverIO (WDIO) reporter**, **Jasmine reporter**, **Cypress reporter**, **Jest reporter**, **Vitest reporter**, and **Mocha reporter** — same triage UI, flaky detection, run history, error grouping, traces, and local-first AI. Pure Node.js. No upload token.

> Practice automation at [**xqa.io/practice**](https://xqa.io/practice)

---

## Features

- **Framework-agnostic** — Playwright, Cypress, Jest, Vitest, Mocha, Jasmine, WebdriverIO
- **Compact triage UI** — Dashboard, Test Runs (compare), Explorer side panel, full case pages
- **Failures-first** — flaky badges, new-fail filter, soft-assert multi-errors, attempt picker
- **Power search** — `s:failed` · `p:chromium` · `@smoke` · `file:` · `error:` · `owner:` · `severity:` · `cluster:` · `regression`
- **Analytics** — defect kinds, AI Insights, error groups, slowest / by-file, coverage, tag health
- **Media & traces** — screenshots, videos, lightbox; Playwright trace viewer via `xreport open`
- **History** — local trends, compare two runs, quarantine tips (`enableHistory`)
- **AI (local-first)** — `ai-context.md/json` per run, Copy Prompt, optional OpenAI-compatible analyze, local MCP
- **CI maturity** — quality gate (`xreport gate`), known-issues mute, quarantine export, shard merge helpers
- **Exports** — HTML, JSON, CSV, CTRF, optional PDF; WDIO worker auto-merge
- **Context API** — `attach` / `testContext` (+ Cypress `cy.xreportNote` / `cy.xreportMeta`)
- **TypeScript & JavaScript** — published types, zero Java, report ready when tests finish

### Features Preview

**Dashboard** — Pass-rate donut, compact KPIs, Explorer / Insights / Debug shortcuts, charts, and a clickable test-case list.

![XREPORT Dashboard](https://raw.githubusercontent.com/ak3ilb/xqa-xreport/main/docs/images/dashboard.png)

**Test Runs** — Local run history with status pills, compare-two-runs (newly failed / passed / still failing / slowdowns), branch & environment filters.

![XREPORT Test Runs](https://raw.githubusercontent.com/ak3ilb/xqa-xreport/main/docs/images/test-runs.png)

**Test Explorer** — Failures-first triage grid with side panel (attempts, steps, errors, logs, attachments) plus Copy error / Copy AI prompt.

![XREPORT Test Explorer](https://raw.githubusercontent.com/ak3ilb/xqa-xreport/main/docs/images/test-explorer.png)

**Analytics** — Defect kinds, AI Insights, suite-by-file, timing, error categories, and clickable error groups with Copy Prompt.

![XREPORT Analytics](https://raw.githubusercontent.com/ak3ilb/xqa-xreport/main/docs/images/analytics.png)

Preview the demo locally:

```bash
npm run sample
npx xreport open ./examples/sample-report
```

### Report UI

| Area | What you get |
|------|----------------|
| **Dashboard** | Pass-rate donut, compact KPIs, Explorer/Insights/Debug shortcuts, charts, test-case table |
| **Test Runs** | Local history table, status pills, branch/env filters, **compare two runs** |
| **Run detail** | Per-run filters (All / Failed / Passed / Flaky / Skipped) + clickable cases |
| **Test Explorer** | Failures-first grid + **side panel** (Attempts · Steps · Error · Logs · Hooks · Attachments · History · Meta) |
| **Case page** | Overview · Errors · Steps (nested) · Hooks · Logs · History · Attachments · Meta |
| **Analytics** | Defect kinds, by-file, slowest, error categories, **AI Insights**, **clickable error groups** + Copy Prompt, coverage, tag health, quarantine tips |
| **Flaky Tests** | Stability % + failure category |
| **Gallery / Timeline** | Screenshots & videos · approximate worker lanes |
| **Config** | Environment + report metadata |

### Triage & search

- **Power search** — `s:failed` · `p:chromium` · `@smoke` · `file:` · `error:` · `owner:` · `severity:` · `cluster:` · `regression` · `!` negation
- **New failures** chip — tests that failed this run but not in the previous history point
- **Sticky Explorer filters** — status / project / tag / sort / query persist in `localStorage`
- **Copy `file:line`** + **Open in IDE** (`vscode://file/...`)
- **Retry attempt picker** — Overview / Errors / Explorer show status & errors per attempt
- **Step category chips** — focus nested steps by `test.step` / `pw:api` / `expect` / etc.
- **Soft asserts** — multiple errors listed separately (`Errors · N`)
- **Owner / severity / tags** — chips in the grid; annotations on Meta
- **Double-click** Explorer row (or **Enter**) → full case page; **Esc** goes back

### Analytics & reliability

- Flaky badges when a test fails then passes on retry
- Per-test **stability score** and failure categories (timing / network / assertion / environment / other)
- **Defect kinds** (product / automation / environment / flake) + mute via `knownIssuesPath`
- Error **clusters** (similar signatures) — click in Analytics to filter Explorer
- Pass-rate trends, environment rates, quarantine tips + `xreport quarantine export`
- **Quality gate** — `xreport gate` for max failed / new / flaky thresholds in CI
- Rerun helpers — `failed-tests.txt` + copyable CLI command
- Shard / merge helpers — see [`docs/sharding.md`](docs/sharding.md)

### Attachments & media

- Screenshots, videos, visual diff pairs, network/DOM previews, lightbox
- Failure evidence strip on Overview
- Embedded Playwright **trace viewer** when traces exist and you use `xreport open`

### Multi-framework & exports

- Reporters: **Playwright**, **Cypress**, **Jest**, **Vitest**, Mocha, Jasmine, WebdriverIO (WDIO workers auto-merge)
- Same HTML UI / triage / history / CTRF across adapters
- Exports: HTML, JSON, CSV, CTRF, optional PDF; `inlineAssets` for a single HTML file
- Self-hosted history: `.xreport/history.json` + CLI
- Branding + Context API (`attach` / `testContext`) where the framework supports it
- TypeScript-first published types
- Allure alternative / Mochawesome alternative — zero Java, report ready when tests finish

### Adapter depth

| Adapter | Entry | Strengths |
|---------|-------|-----------|
| Playwright | `@xqa.io/xreport/playwright` | Steps, traces, screenshots/video, annotations → owner/severity/tags |
| Cypress | `@xqa.io/xreport/cypress` + `/cypress/support` | Specs, attempts, screenshots/video, command-log Steps, `cy.xreportNote` / `cy.xreportMeta` |
| Jest | `@xqa.io/xreport/jest` | Describe nesting, `attach.note` / `attach.meta`, assertion errors, `@tags` |
| Vitest | `@xqa.io/xreport/vitest` | Nested suites, `attach.note` / `test.meta`, assertion errors, `@tags` |
| Mocha | `@xqa.io/xreport/mocha` | Context API attach, retries |
| Jasmine | `@xqa.io/xreport/jasmine` | Specs + failed expectations |
| WebdriverIO | `@xqa.io/xreport/webdriverio` | Worker auto-merge |

---

## How to use (5 minutes)

```bash
npm i -D @xqa.io/xreport
# add reporter to playwright.config.ts (see Quick start)
npx playwright test
npx xreport open ./xreport
```

1. **Install** `@xqa.io/xreport` in your test project.
2. **Wire the reporter** for your framework ([Quick start](#quick-start) — Playwright · Cypress · Jest · Vitest · Mocha · Jasmine · WebdriverIO).
3. **Run tests** — HTML (+ optional CSV / CTRF) is written when the run finishes.
4. **Open the report** with `npx xreport open ./xreport` (recommended for traces & media).
5. **Triage** — Dashboard → Test Runs (compare) → Test Explorer → full case page.
6. **Optional history** — `enableHistory: true` + `historyOptions.saveFullResults: true` for stability, compare, and past-run drill-down.

---

## Usage guide

### Open & navigate the report

```bash
npx xreport open ./xreport --port 4173
```

| Page | Typical job |
|------|-------------|
| Dashboard | Skim pass rate, open failed cases, copy rerun command |
| Test Runs | Browse history, **compare** baseline → newer, open a run |
| Test Explorer | Filter/search failures, inspect side panel, open full case |
| Analytics | Click an error group → Explorer filtered to that cluster |
| Case page | Deep dive: errors per attempt, nested steps, hooks, attachments, meta |

**Keyboard**

| Shortcut | Action |
|----------|--------|
| `/` or `⌘K` / `Ctrl+K` | Focus search |
| `f` | Jump to Explorer + Failed filter |
| `j` / `k` or `↓` / `↑` | Move selection in Explorer |
| `Enter` | Open selected case (full page) |
| `Esc` | Close lightbox, or leave case page |
| `[` / `]` | Previous / next case tab |

### Power search examples

Type in the top search box (works on Explorer / Gallery):

```text
s:failed
s:flaky
p:chromium
@smoke
file:checkout
error:timeout
owner:payments-team
severity:critical
cluster:951fa440f6
regression
!@wip
s:failed owner:identity
```

### Compare two local runs

Requires `enableHistory: true` and (for past runs) `historyOptions.saveFullResults: true`.

1. Open **Test Runs**.
2. In **Compare runs**, pick baseline → newer (defaults: previous history → current).
3. Review KPIs: **newly failed · newly passed · still failing · slower (≥250ms)**.
4. Click a row to open that case when it exists in the current report.

### Explorer triage loop

1. Filter **Failed** or **New failures**.
2. Click a row → side panel loads Attempts / Error / Logs / Attachments.
3. Switch attempt chips when retries exist.
4. **Open full page** (button), or double-click / `Enter`.
5. On the case page: Errors · Steps · Hooks · Meta; copy path / Open in IDE.

### Case page tabs

| Tab | Contents |
|-----|----------|
| Overview | KPIs, attempt picker, attempt list, error preview, failure evidence |
| Errors | Soft-assert / multi-error list for the selected attempt |
| Steps | Nested `test.step` tree; **category chips** to focus `test.step` / `expect` / `pw:api` / etc. |
| Hooks | beforeEach / afterEach, etc. |
| Logs | stdout / stderr / log entries |
| History | Prior run status + duration (needs history) |
| Attachments | Screenshots, diffs, network, DOM, traces |
| Meta | Owner, severity, tags, labels, full annotations |

---

## Quick start

### Playwright

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['@xqa.io/xreport/playwright', {
      reportTitle: 'E2E · XREPORT',
      reportDir: './xreport',
      exportCSV: true,
      exportCtrf: true,
      enableHistory: true,
      historyOptions: { saveFullResults: true },
      branding: {
        projectName: 'XREPORT',
        companyName: 'XQA',
        website: 'https://xqa.io',
        accentColor: '#0071E3',
      },
    }],
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
});
```

```bash
npx playwright test
npx xreport open ./xreport
```

#### In your specs

Enrich Meta / Steps / Errors / Attachments with Playwright APIs XREPORT already maps:

```ts
import { test, expect } from '@playwright/test';

test('pays with valid card @smoke', {
  tag: ['@smoke', '@payments'],
  annotation: [
    { type: 'owner', description: 'payments-team' },
    { type: 'severity', description: 'critical' },
    { type: 'tag', description: 'checkout' },   // merges into tags[]
    { type: 'jira', description: 'PAY-1204' },  // Meta label
  ],
}, async ({ page }, testInfo) => {
  await test.step('Navigate to /checkout', async () => {
    await page.goto('/checkout');
  });

  await test.step('Fill shipping form', async () => {
    await test.step('Enter address', async () => {
      await page.fill('#street', '1 Market St');
    });
    await page.fill('#zip', '94105');
  });

  // Soft asserts → multiple Errors tab entries
  await expect.soft(page.locator('#pay')).toBeVisible();
  await expect.soft(page.locator('#confirm')).toBeVisible();

  await testInfo.attach('failure.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
```

Report search: `owner:payments-team` · `severity:critical` · `@checkout`.

### Cypress

**Recommended** — plugin + support (screenshots, video, command Steps):

```ts
// cypress.config.ts
import { defineConfig } from 'cypress';
import { setupXReport } from '@xqa.io/xreport/cypress';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      setupXReport(on, config, {
        reportTitle: 'Cypress · XREPORT',
        reportDir: './xreport',
        exportCtrf: true,
        enableHistory: true,
        historyOptions: { saveFullResults: true },
      });
      return config;
    },
    screenshotOnRunFailure: true,
    video: true,
  },
});
```

```ts
// cypress/support/e2e.ts
import { registerXReportCypress } from '@xqa.io/xreport/cypress/support';
registerXReportCypress();
```

```js
// in a spec
cy.xreportMeta({ owner: 'identity', severity: 'critical' });
cy.xreportNote({ cartId: 'demo' }, 'cart');
```

```bash
npx cypress run
npx xreport open ./xreport
```

Full guide: [`examples/cypress/README.md`](./examples/cypress/README.md)

Optional Mocha-style reporter: `reporter: '@xqa.io/xreport/cypress'` + `reporterOptions`.

### Jest

```js
// jest.config.js
module.exports = {
  reporters: [
    'default',
    ['@xqa.io/xreport/jest', {
      reportTitle: 'Jest · XREPORT',
      reportDir: './xreport',
      exportCtrf: true,
      enableHistory: true,
      historyOptions: { saveFullResults: true },
    }],
  ],
};
```

```bash
npx jest
npx xreport open ./xreport
```

Guide + sample: [`examples/jest/README.md`](./examples/jest/README.md)

### Vitest

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      ['@xqa.io/xreport/vitest', {
        reportTitle: 'Vitest · XREPORT',
        reportDir: './xreport',
        exportCtrf: true,
        enableHistory: true,
        historyOptions: { saveFullResults: true },
      }],
    ],
  },
});
```

```bash
npx vitest run
npx xreport open ./xreport
```

Guide + sample: [`examples/vitest/README.md`](./examples/vitest/README.md)

### Mocha

```json
{
  "reporter": "@xqa.io/xreport/mocha",
  "reporterOptions": {
    "reportTitle": "API Tests",
    "exportCSV": true,
    "autoOpen": true,
    "enableHistory": true
  }
}
```

```js
const { attach } = require('@xqa.io/xreport/context');

it('adds context', function () {
  attach(this, { type: 'json', title: 'Payload', value: { ok: true } });
});
```

### Jasmine

```js
const Jasmine = require('jasmine');
const XReportJasmine = require('@xqa.io/xreport/jasmine');

const jasmine = new Jasmine();
jasmine.loadConfigFile('spec/support/jasmine.json');
jasmine.addReporter(new XReportJasmine({
  reportTitle: 'Jasmine · XREPORT',
  enableHistory: true,
  branding: { projectName: 'XQA', website: 'https://xqa.io' },
}));
jasmine.execute();
```

### WebdriverIO

```js
exports.config = {
  reporters: [
    'spec',
    ['@xqa.io/xreport/webdriverio', {
      reportTitle: 'WDIO · XREPORT',
      reportDir: './xreport',
      exportCtrf: true,
      enableHistory: true,
    }],
  ],
};
```

Workers merge automatically into one report.

---

## Context API

Works with Mocha/Jasmine (`this`), plus Jest/Vitest keyed helpers:

```js
const { attach } = require('@xqa.io/xreport/context');

// Mocha / Jasmine
attach(this, 'Plain note');
attach(this, { type: 'json', title: 'Response', value: { status: 200 } });
await attach.screenshot(this, './shot.png', 'Checkout');
await attach.video(this, './run.webm', 'Session');

// Jest / Vitest (current test via expect.getState)
attach.note({ type: 'json', title: 'payload', value: { ok: true } });
attach.meta({ owner: 'payments', severity: 'critical', labels: { jira: 'PAY-1' } });

// Explicit key (any adapter)
attach.to('Checkout › pays with card', { type: 'text', title: 'hint', value: '…' });
```

Cypress (after `registerXReportCypress()`): `cy.xreportNote(…)` · `cy.xreportMeta(…)`.

Alias: `testContext` (compatible naming).

---

## CLI

```bash
npx xreport generate ./xreport/xreport.json -o ./xreport
npx xreport open ./xreport --port 4173
npx xreport merge ./xreport/.partials -o ./xreport
npx xreport view

# History & flake triage
npx xreport history list 20
npx xreport history stats
npx xreport history trends 30
npx xreport history flakes
npx xreport history failed-rerun ./xreport/xreport.json
npx xreport history delete --days=60
npx xreport history cleanup --max=50
npx xreport history export backup.json
npx xreport history import backup.json

# AI (local-first — no cloud account required)
npx xreport ai context ./xreport
npx xreport ai analyze ./xreport   # needs XREPORT_AI_BASE_URL / optional API key
npx xreport mcp                    # or: npx xreport-mcp
npx xreport gate ./xreport --max-failed=0 --max-new=0
npx xreport quarantine export ./xreport
```

CI recipes (CTRF → GitHub summary / PR / Slack), sharding merge, known-issues, and Cursor MCP: see [`docs/ci/README.md`](docs/ci/README.md), [`docs/sharding.md`](docs/sharding.md), [`docs/agents-mcp.md`](docs/agents-mcp.md).

---

## AI (local-first)

XREPORT ships **agent fuel** next to every report — no upload, no required API key.

### Context pack (always on)

After each run (unless `ai.writeContextPack: false`):

- `xreport/ai-context.md` — paste into Cursor / ChatGPT
- `xreport/ai-context.json` — structured clusters, failures, flake tips

CLI: `npx xreport ai context ./xreport`

In the HTML report: **Copy AI prompt** on the case / Explorer panel, and **Copy Prompt for Cursor** on Analytics error groups.

### Optional LLM insights

OpenAI-compatible providers (OpenAI, Azure, OpenRouter, **Ollama**):

```ts
['@xqa.io/xreport/playwright', {
  ai: {
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: process.env.XREPORT_AI_BASE_URL || 'http://127.0.0.1:11434/v1',
    apiKey: process.env.XREPORT_AI_API_KEY, // optional for local Ollama
    model: process.env.XREPORT_AI_MODEL || 'llama3.2',
    budget: { maxFailures: 15, maxTokens: 8000 },
  },
}]
```

Or after a run: `XREPORT_AI_BASE_URL=http://127.0.0.1:11434/v1 npx xreport ai analyze ./xreport`

Insights appear under Analytics → **AI Insights** and are cached by error signature (`ai-insight-cache.json`).

### Local MCP for Cursor

```json
{
  "mcpServers": {
    "xreport": {
      "command": "npx",
      "args": ["-y", "@xqa.io/xreport-mcp"],
      "env": {
        "XREPORT_DIR": "/absolute/path/to/your/xreport"
      }
    }
  }
}
```

Or use the bin from this package: `npx xreport-mcp` / `npx xreport mcp`.

Heuristic triage (clusters, defect kind: product / automation / environment / flake) stays free and always on. LLM is an optional enhancement — we explain and prioritize; we do not claim to auto-fix tests.

---

## Configuration

```ts
{
  reportDir: './xreport',
  reportTitle: 'XREPORT',
  reportFilename: 'index',        // placeholders: [datetime] [date] [time] [status]
  autoOpen: true,
  exportCSV: false,
  exportPDF: false,               // needs playwright or puppeteer
  exportCtrf: true,
  enableHistory: false,
  inlineAssets: false,            // embed media into HTML when true
  historyOptions: {
    dbPath: './.xreport/history.json',
    maxRecords: 100,
    retentionDays: 30,
    autoCleanup: true,
    saveFullResults: true,        // compare runs, case History, per-test stability
  },
  ai: {
    enabled: false,               // optional OpenAI-compatible analyze
    writeContextPack: true,       // ai-context.md + .json (default true)
    provider: 'openai-compatible',
    baseUrl: process.env.XREPORT_AI_BASE_URL,
    apiKey: process.env.XREPORT_AI_API_KEY,
    model: 'gpt-4.1-mini',
    budget: { maxFailures: 15, maxTokens: 8000 },
  },
  knownIssuesPath: './.xreport/known-issues.json', // mute expected failures
  qualityGate: { maxFailed: 0, maxNewFailures: 0 }, // use with: xreport gate
  branding: {
    projectName: 'XREPORT',
    companyName: 'XQA',
    accentColor: '#0071E3',
    website: 'https://xqa.io',
  },
}
```

### Recommended production settings

```ts
['@xqa.io/xreport/playwright', {
  reportDir: './xreport',
  exportCtrf: true,              // CI / PR comment ecosystems
  enableHistory: true,
  historyOptions: {
    saveFullResults: true,       // compare + history tabs
    maxRecords: 50,
    retentionDays: 30,
  },
  branding: {
    projectName: 'My Product',
    companyName: 'My Team',
    website: 'https://example.com',
    accentColor: '#0071E3',
  },
}]
```

---

## Why teams choose XREPORT

| Pain | XREPORT |
|------|---------|
| Java-based reporters / `JAVA_HOME` | Pure Node.js |
| Two-step generate after tests | Report ready when tests finish |
| WDIO parallel → many partials | Auto-merge |
| Flaky tests look green after retry | Flaky badge, stability score, category |
| Hard Slack / PR share | CTRF JSON + HTML artifact |
| Sparse demo UIs | Dashboard + explorer workstation |
| Need spreadsheets / PDF | CSV + optional PDF |
| Cloud-only analytics | Self-hosted local HTML + history |
| AI tied to a SaaS account | Local context pack + optional LLM + MCP |

### Capability snapshot

| Capability | XREPORT | Typical Java reporters | Built-in Playwright HTML |
|------------|:-------:|:----------------------:|:------------------------:|
| Playwright | ✅ | ✅ | ✅ |
| Cypress | ✅ | ✅ | ❌ |
| Jest | ✅ | ✅ | ❌ |
| Vitest | ✅ | limited | ❌ |
| Mocha / Jasmine / WDIO | ✅ | ✅ | ❌ |
| No Java / local HTML | ✅ | ❌ | ✅ |
| Dashboard + run history + compare | ✅ | limited | ❌ |
| Flaky stability + categories | ✅ | limited | ❌ |
| Filterable explorer + chips | ✅ | ✅ | ✅ |
| Embedded trace viewer (PW) | ✅ | ✅ | ✅ |
| CTRF export | ✅ | ❌ | ❌ |

---

## Output

```
xreport/
├── index.html
├── xreport.json
├── ai-context.md        # agent prompt (local-first AI)
├── ai-context.json
├── ctrf-report.json
├── failed-tests.txt     # when failures exist
├── xreport.csv          # optional
├── trace-viewer/        # when Playwright is installed + traces present
└── media/
```

History (when enabled): `.xreport/history.json`

---

## About XQA

**[XQA](https://xqa.io)** — free automation practice platform (40+ scenarios for Selenium, Cypress, Playwright, WebdriverIO).

- Practice: [https://xqa.io/practice](https://xqa.io/practice)
- GitHub: [https://github.com/ak3ilb/xqa-xreport](https://github.com/ak3ilb/xqa-xreport)

```bash
git clone git@github.com:ak3ilb/xqa-xreport.git
cd xqa-xreport && npm install && npm run build
npm run sample
npx xreport open ./examples/sample-report

# Adapter smoke (Jest / Vitest / Cypress reporters without installing those frameworks)
npm run smoke:reporters
```

## Sample guides

| Framework | Guide |
|-----------|--------|
| Playwright demo report | `npm run sample` → `examples/sample-report` |
| Cypress | [`examples/cypress/README.md`](./examples/cypress/README.md) |
| Jest | [`examples/jest/README.md`](./examples/jest/README.md) |
| Vitest | [`examples/vitest/README.md`](./examples/vitest/README.md) |

## License

MIT © [XQA](https://xqa.io)

```bash
npm i -D @xqa.io/xreport
```
