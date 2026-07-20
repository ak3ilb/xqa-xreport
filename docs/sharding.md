# Shard / multi-worker merge

XREPORT prefers one HTML report for the whole CI matrix.

## Playwright shards

Each shard writes its own `xreport.json` (use unique `reportDir` per shard):

```ts
// shard 1
['@xqa.io/xreport/playwright', { reportDir: './xreport-shard-1', autoOpen: false }]
// shard 2
['@xqa.io/xreport/playwright', { reportDir: './xreport-shard-2', autoOpen: false }]
```

Merge after all shards finish:

```bash
npx xreport merge ./xreport-shard-1/xreport.json ./xreport-shard-2/xreport.json -o ./xreport
npx xreport open ./xreport
```

Or merge folders of partial JSON:

```bash
npx xreport merge ./xreport-shard-1 ./xreport-shard-2 -o ./xreport
```

## WebdriverIO workers

The WDIO reporter writes `.partials/worker-*.json` and merges automatically when the last worker finishes. If you need a manual merge:

```bash
npx xreport merge ./xreport/.partials -o ./xreport
```

## Cypress / Jest / Vitest

Prefer a single process report. For matrix jobs, collect each job’s `xreport.json` artifact and run `xreport merge` in a final job (same as Playwright shards).

## History note

Enable `enableHistory` on the **merged** report job (or restore `.xreport/history.json` cache before merge) so compare / stability stay meaningful. See [CI recipes](./ci/README.md).
