# @xqa.io/xreport-mcp

Local [MCP](https://modelcontextprotocol.io) server for **XREPORT**. Gives coding agents access to your latest `xreport.json` and `.xreport/history.json` — **no cloud account**.

## Install

```bash
npm i -D @xqa.io/xreport @xqa.io/xreport-mcp
```

Or use the bin from the main package:

```bash
npx xreport-mcp
# same as: npx xreport mcp
```

## Agent `mcp.json`

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

## Tools

| Tool | Purpose |
|------|---------|
| `xreport_last_run` | Latest run summary |
| `xreport_list_runs` | Local history list |
| `xreport_failures` | Failed tests |
| `xreport_clusters` | Error groups |
| `xreport_test_history` | Per-test history points |
| `xreport_get_context` | Full agent prompt / single-test prompt |
| `xreport_flaky_top` | Quarantine + flaky list |
| `xreport_gate_status` | Quality gate result / violations |
| `xreport_known_issues` | Muted / known-issue matches |

Set `XREPORT_DIR` to the folder that contains `xreport.json`.

Practice automation: https://xqa.io/practice
