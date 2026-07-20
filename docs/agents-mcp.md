# Cursor / agents — local MCP + context pack

XREPORT feeds agents without a cloud login.

## One-click context (no MCP)

After any run:

```bash
npx xreport ai context ./xreport
```

Paste `xreport/ai-context.md` into Cursor chat, or use **Copy AI prompt** / **Copy Prompt for Cursor** in the HTML report.

## MCP (`mcp.json`)

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

Or from this package: `npx xreport mcp` / `npx xreport-mcp`.

### Tools

| Tool | Use when |
|------|----------|
| `xreport_last_run` | Summarize latest local run |
| `xreport_failures` | List failed tests |
| `xreport_clusters` | Group root causes |
| `xreport_get_context` | Full agent prompt (or one `testId`) |
| `xreport_test_history` | Stability for a `historyId` |
| `xreport_flaky_top` | Quarantine candidates |
| `xreport_list_runs` | Local history |

## Suggested agent skill (paste into Cursor rules)

```text
When fixing failing tests in this repo:
1. Call xreport_get_context (or read xreport/ai-context.md).
2. Fix the highest-impact cluster first (product vs automation vs environment vs flake).
3. Prefer the likelyFixFile / stack file:line from the context pack.
4. Do not claim tests are fixed until xreport_failures is empty or the user confirms.
```

## Optional local LLM

```bash
XREPORT_AI_BASE_URL=http://127.0.0.1:11434/v1 npx xreport ai analyze ./xreport
```

Insights appear under Analytics → AI Insights. Heuristic defect kinds stay free without any API key.
