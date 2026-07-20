# Cypress + XREPORT

## Install

```bash
npm i -D @xqa.io/xreport cypress
```

## 1. Plugin (`cypress.config.ts`)

```ts
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

## 2. Support (command log → Steps)

```ts
// cypress/support/e2e.ts
import { registerXReportCypress } from '@xqa.io/xreport/cypress/support';
registerXReportCypress();
```

## 3. In specs

```js
it('checks checkout @smoke', () => {
  cy.xreportMeta({ owner: 'payments', severity: 'critical' });
  cy.visit('/checkout');
  cy.xreportNote({ cartId: 'demo' }, 'cart');
  cy.get('#pay').click();
});
```

## Run

```bash
npx cypress run
npx xreport open ./xreport
```

### What lands in the report

| Source | Report tab |
|--------|------------|
| Failures + retries | Overview / Errors / Attempts |
| Screenshots on failure | Attachments |
| Spec video (failed tests) | Attachments |
| `cy:*` command log | Steps |
| `cy.xreportNote` / `cy.xreportMeta` | Attachments / Meta |

Sample tree in this folder: `cypress.config.ts`, `cypress/support/e2e.js`, `cypress/e2e/login.cy.js`.
