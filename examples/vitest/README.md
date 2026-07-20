# Vitest + XREPORT

## Install

```bash
npm i -D @xqa.io/xreport vitest
```

## Config

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      [
        '@xqa.io/xreport/vitest',
        {
          reportTitle: 'Vitest · XREPORT',
          reportDir: './xreport',
          exportCtrf: true,
          enableHistory: true,
          historyOptions: { saveFullResults: true },
        },
      ],
    ],
  },
});
```

## Attach context in tests

```ts
import { attach } from '@xqa.io/xreport/context';

it('covers pricing @smoke', () => {
  attach.note({ type: 'json', title: 'quote', value: { total: 42 } });
  attach.meta({ owner: 'billing', severity: 'high' });
  expect(1).toBe(1);
});

// Or Vitest test meta:
it('flagged', { meta: { owner: 'billing', severity: 'critical' } }, () => {
  expect(true).toBe(true);
});
```

## Run

```bash
npx vitest run
npx xreport open ./xreport
```

Sample files: `vitest.config.ts`, `sum.test.ts`.
