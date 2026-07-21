# XREPORT AI context

Generated: 2026-07-21T16:54:34.559Z

You are helping fix failing automated tests. Use only the evidence below.

## Run: XREPORT Sample · Local Triage Demo
- Framework: playwright
- Summary: 3 passed / 2 failed / 1 flaky / 7 total
- Branch: main
- Commit: abc123def456

## Top failure clusters (fix root causes, not every test)

### Cluster 75c2e98605 ×1
- Signature: timeout nms exceeded. waiting for locator('#pay')
- Category: timing · Defect: flake
- Likely file: checkout.spec.ts
- Sample: Timeout 5000ms exceeded.
waiting for locator("#pay")
- Example test: Checkout › pays with valid card @smoke
- Example location: tests/checkout.spec.ts:42
```
Error: Timeout
    at checkout.spec.ts:48
```

### Cluster 543e8a6a47 ×1
- Signature: expected url to contain /dashboard, got /error
- Category: assertion · Defect: flake
- Likely file: auth.spec.ts
- Sample: Expected URL to contain /dashboard, got /error
- Example test: Auth › SSO redirect @smoke
- Example location: tests/auth.spec.ts:33
```
Error: URL
    at auth.spec.ts:40
```

### Cluster 9748c9e089 ×1
- Signature: test timeout of nms exceeded.
- Category: timing · Defect: flake
- Sample: Test timeout of 30000ms exceeded.
- Example test: Catalog › filters by price
- Example location: tests/catalog.spec.ts:22

## Rerun failed
```
npx playwright test "tests/checkout.spec.ts" "tests/auth.spec.ts" "tests/catalog.spec.ts"
```

## Your task
1. Identify the highest-impact root cause(s).
2. Say whether each is product / automation / environment / flake.
3. Propose concrete code or test changes with file paths.
4. If evidence is insufficient, say what to inspect next (trace, network, history).
