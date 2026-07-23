# CI recipes for XREPORT (local-first)

XREPORT stays on your machine. Use [CTRF](https://ctrf.io) JSON (enabled by default via `exportCtrf: true`) to plug into GitHub summaries, PR comments, and Slack — without a hosted reporter account.

## This repository’s workflows

| Workflow | Purpose |
|----------|---------|
| [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | `npm test` + enterprise E2E + sample `gate --json` + artifact upload |
| [`.github/workflows/hourly-sample.yml`](../../.github/workflows/hourly-sample.yml) | Hourly practice smokes + gate JSON in the job summary |
| [`.github/workflows/cleanup-sample-artifacts.yml`](../../.github/workflows/cleanup-sample-artifacts.yml) | Delete aged hourly artifacts |

Local equivalents:

```bash
npm test                  # typecheck + unit + reporter smoke
npm run verify:enterprise # gate / evidence / privacy / readiness
npm run test:ci           # both
npm run sample            # regenerate examples/sample-report
npx xreport gate ./examples/sample-report --json --max-failed=999
```

Copy-paste consumer template: [`github-actions.example.yml`](./github-actions.example.yml).

## Persist history across CI jobs

```yaml
- uses: actions/cache@v4
  with:
    path: .xreport
    key: xreport-history-${{ github.ref_name }}-${{ github.run_id }}
    restore-keys: |
      xreport-history-${{ github.ref_name }}-
      xreport-history-

- run: npx playwright test
  # reporter options: enableHistory: true (saveFullResults defaults on)

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: xreport
    path: xreport/
```

## GitHub Job Summary (via CTRF)

```yaml
- name: CTRF GitHub Summary
  if: always()
  uses: ctrf-io/github-test-reporter@v1
  with:
    report-path: xreport/ctrf-report.json
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Check [ctrf-io/github-test-reporter](https://github.com/ctrf-io/github-test-reporter) for current inputs (PR comment flags, etc.).

## Pull request comment

Most CTRF GitHub actions can post a PR comment when `pull_request` is the event. Prefer the official CTRF action rather than a custom bot:

```yaml
on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npx playwright test
      - uses: ctrf-io/github-test-reporter@v1
        if: always()
        with:
          report-path: xreport/ctrf-report.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Slack / Teams

Pipe CTRF into community notifiers (examples — pick one maintained package):

```bash
# After tests write xreport/ctrf-report.json
npx ctrf slack https://hooks.slack.com/services/... --file xreport/ctrf-report.json
```

Or use any Slack webhook script that reads CTRF summary fields: `results.summary.passed|failed|flaky`.

## Quality gate in CI

Prefer `--json` so Job Summaries and annotations can parse the result without scraping stdout:

```yaml
- name: XREPORT quality gate (finance PR)
  if: always()
  env:
    XREPORT_CHANGE_TICKET: ${{ github.event.pull_request.title }}  # or a real ticket id
  run: |
    npx xreport gate ./xreport --preset=finance-pr --json | tee gate-result.json
    {
      echo "### XREPORT quality gate"
      echo ""
      echo '```json'
      cat gate-result.json
      echo '```'
    } >> "$GITHUB_STEP_SUMMARY"

- name: XREPORT quality gate (custom)
  if: always()
  run: npx xreport gate ./xreport --max-failed=0 --max-new=0 --max-critical=0 --json

- name: Evidence pack for auditors
  if: always()
  run: npx xreport evidence ./xreport -o ./xreport-evidence.zip

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: xreport-evidence
    path: |
      xreport-evidence.zip
      gate-result.json
```

| Preset | Intent |
|--------|--------|
| `finance-pr` | maxNewFailures=0, ignore muted, require change ticket, maxCriticalFailed=0 |
| `finance-release` | maxFailed=0, maxProductDefects=0, failOnUnknownDefect, require ticket + commit |
| `nightly` | allow muted failures; fail on product defects only |

Mute expected failures with `.xreport/known-issues.json` (see [known-issues.md](./known-issues.md)).

## Upload HTML for humans

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: xreport-html
    path: |
      xreport/index.html
      xreport/xreport.json
      xreport/ai-context.md
      xreport/ctrf-report.json
      xreport/gate-result.json
```

Open locally with `npx xreport open ./xreport` after download (needed for embedded traces).
