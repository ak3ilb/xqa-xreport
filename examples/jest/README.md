# Jest + XREPORT

## Install

```bash
npm i -D @xqa.io/xreport jest
```

## Config

```js
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  reporters: [
    'default',
    [
      '@xqa.io/xreport/jest',
      {
        reportTitle: 'Jest · XREPORT',
        reportDir: './xreport',
        exportCSV: true,
        exportCtrf: true,
        enableHistory: true,
        historyOptions: { saveFullResults: true },
      },
    ],
  ],
};
```

## Attach context in tests

```js
const { attach } = require('@xqa.io/xreport/context');

it('covers pricing @smoke', () => {
  attach.note({ type: 'json', title: 'quote', value: { total: 42 } });
  attach.meta({ owner: 'billing', severity: 'high', labels: { jira: 'BILL-9' } });
  // or: attach.to('suite name test name', { type: 'text', title: 'hint', value: '…' });
  expect(1).toBe(1);
});
```

`attach.note` / `attach.meta` bind to the current test via Jest's `expect.getState().currentTestName`.

## Run

```bash
npx jest
npx xreport open ./xreport
```

Sample files in this folder: `jest.config.js`, `math.test.js`.
