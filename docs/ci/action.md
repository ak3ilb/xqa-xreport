# XREPORT GitHub Action

Composite Action that runs after your tests write `./xreport`.

## Usage

```yaml
- name: XREPORT gate + artifacts
  if: always()
  uses: ak3ilb/xqa-xreport@v0.7.0
  with:
    report-dir: ./xreport
    preset: finance-pr
    change-ticket: ${{ github.event.pull_request.title }}
    evidence: true
    upload-artifact: true
    ctrf-summary: true
    fail-on-gate: true
```

Pin a commit SHA or release tag (`v0.7.0`) rather than `@main` in production.

## Inputs

| Input | Default | Purpose |
|-------|---------|---------|
| `report-dir` | `./xreport` | Folder with `xreport.json` |
| `preset` | _(empty)_ | `finance-pr` / `finance-release` / `nightly` |
| `max-failed` / `max-new` / `max-critical` | | Numeric gate overrides |
| `change-ticket` | | Sets `XREPORT_CHANGE_TICKET` |
| `evidence` | `false` | Build evidence zip |
| `evidence-out` | `./xreport-evidence.zip` | Zip path |
| `upload-artifact` | `true` | Upload report + gate JSON |
| `artifact-name` | `xreport` | Artifact prefix |
| `fail-on-gate` | `true` | Fail step on gate exit ≠ 0 |
| `ctrf-summary` | `true` | Run CTRF GitHub summary action |

## Outputs

- `gate-ok` — `true` / `false`
- `gate-exit-code` — process exit code
- `gate-result-path` — usually `gate-result.json`

Requires `@xqa.io/xreport` installed in the job (`npm ci`) so `npx xreport` resolves.
