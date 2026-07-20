# Known issues + quality gate

Mute expected failures locally and fail CI only on real regressions.

## `known-issues.json`

Place at `.xreport/known-issues.json`, `./xreport-known-issues.json`, or pass `knownIssuesPath` in reporter options.

```json
{
  "version": 1,
  "issues": [
    {
      "id": "KI-LOGIN-FLAKE",
      "reason": "Third-party auth intermittently slow",
      "mute": true,
      "match": { "signatureContains": "waiting for locator" }
    },
    {
      "id": "KI-TITLE",
      "mute": true,
      "match": { "titleRegex": "flaky checkout" }
    },
    {
      "id": "KI-CLUSTER",
      "mute": true,
      "match": { "clusterId": "a1b2c3d4e5" }
    }
  ]
}
```

Match fields (any one is enough): `historyId`, `clusterId`, `signatureContains`, `titleRegex`.

Muted tests show a **muted** / **known:** badge in the HTML report and are ignored by `xreport gate` unless you pass `--count-muted`.

## Quality gate CLI

```bash
npx xreport gate ./xreport \
  --max-failed=0 \
  --max-new=0 \
  --max-product=0 \
  --max-clusters=5 \
  --fail-unknown
```

Exit `0` on pass, `2` on violation.

## Quarantine export

```bash
npx xreport quarantine export ./xreport -o quarantine.txt
```

Writes historyIds / tips for review — does not auto-skip tests. Wire skips in your runner after review.
