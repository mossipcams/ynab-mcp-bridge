# AI Tool and Token Optimization Plan

## Goal

Make the YNAB MCP tools work better for on-demand AI callers by:

- reducing token-heavy responses
- making raw retrieval more targeted
- preserving good drill-down paths
- adding a few high-value finance diagnostics that AI can call cheaply

## Principles

- Default to compact outputs.
- Make expensive tools explicitly opt-in.
- Prefer one precise call over multiple broad calls.
- Keep summary tools bounded and opinionated.
- Keep raw-detail tools available for drill-down only.

## Task 1: Add compact serialization as the default response mode

- What test to write:
  - Add tests proving tool responses default to minified JSON instead of pretty-printed JSON.
  - Add tests proving a `view` or `format` option can still request readable pretty output where needed.
- What code to implement:
  - Update shared response helpers in `src/tools/planToolUtils.ts`.
  - Add a compact default serialization path.
  - Optionally support `format: "compact" | "pretty"` or `view: "compact" | "full"` in shared helpers.
- How to verify it works:
  - Run targeted Vitest coverage for helper tests and one representative summary tool.
  - Manually confirm token-heavy whitespace is removed from tool output.

## Task 2: Add common pagination and projection controls to collection tools

- What test to write:
  - Add tests for `limit`, `offset` or `cursor`, `includeIds`, and `fields` on collection-style tools.
  - Add tests proving defaults remain compact and bounded.
- What code to implement:
  - Extend list/search-like tools to support common controls:
    - `limit`
    - `offset` or `cursor`
    - `fields`
    - `includeIds`
  - Apply first to:
    - `ynab_list_transactions`
    - `ynab_list_scheduled_transactions`
    - `ynab_list_accounts`
    - `ynab_list_payees`
    - `ynab_list_plan_months`
    - `ynab_list_categories`
- How to verify it works:
  - Run targeted tests for each updated tool.
  - Confirm smaller outputs when requesting a narrow field set and limit.

## Task 3: Create a general-purpose transaction search tool

- What test to write:
  - Add tests covering combinations of filters:
    - date range
    - payee
    - account
    - category
    - approved
    - cleared
    - amount bounds
    - limit
    - fields
  - Add tests confirming sort order and bounded output.
- What code to implement:
  - Add `ynab_search_transactions`.
  - Fetch only the needed transaction window, then filter and project compactly.
  - Support AI-friendly defaults with a low default limit.
- How to verify it works:
  - Run focused Vitest tests for search behavior.
  - Manually compare one search call against current multi-call drill-down workflows.

## Task 4: Add compact views for raw object tools

- What test to write:
  - Add tests showing raw object tools return a compact projection by default.
  - Add tests proving a full view still returns richer detail when explicitly requested.
- What code to implement:
  - Apply compact/full modes to:
    - `ynab_get_plan`
    - `ynab_get_plan_month`
    - `ynab_get_account`
    - `ynab_get_category`
    - `ynab_get_month_category`
    - `ynab_get_payee`
  - Keep current full payload behavior behind an explicit opt-in.
- How to verify it works:
  - Run targeted tests for each tool.
  - Check that default outputs shrink materially without losing key decision fields.

## Task 5: Add a first-pass financial health check tool

- What test to write:
  - Add tests covering healthy, stressed, and mixed-finance scenarios.
  - Add tests proving the tool returns:
    - overall status
    - key metrics
    - top risks
    - recommended follow-up tool calls
- What code to implement:
  - Add `ynab_get_financial_health_check`.
  - Combine outputs derived from existing internal logic for:
    - snapshot
    - budget health
    - cleanup issues
    - income stability
    - upcoming obligations
    - goal gaps
  - Return compact findings, not a giant merged payload.
- How to verify it works:
  - Run focused tests for the health-check tool.
  - Manually inspect whether the output is actionable in one tool call.

## Task 6: Add emergency fund and cash runway diagnostics

- What test to write:
  - Add tests for months of expense coverage using liquid cash and recent outflows.
  - Add tests for edge cases like zero expenses or zero cash.
- What code to implement:
  - Add:
    - `ynab_get_emergency_fund_coverage`
    - `ynab_get_cash_runway`
  - Compute coverage using existing account balances plus recent spending/cash flow windows.
- How to verify it works:
  - Run targeted tests.
  - Manually validate calculations against simple mocked scenarios.

## Task 7: Add debt diagnostics

- What test to write:
  - Add tests for debt balances, top debt accounts, payment flow, and debt pressure indicators.
  - Add tests for mixed on-budget and off-budget debt accounts.
- What code to implement:
  - Add `ynab_get_debt_summary`.
  - Build on existing account and money movement logic to show:
    - total debt
    - debt by account
    - recent payment trend
    - debt concentration
- How to verify it works:
  - Run targeted tests.
  - Manually inspect whether the tool highlights growing debt risk cleanly.

## Task 8: Add recurring expense and subscription diagnostics

- What test to write:
  - Add tests for merchant cadence detection from transaction history.
  - Add tests for combining inferred recurring spend with scheduled transactions.
- What code to implement:
  - Add `ynab_get_recurring_expense_summary`.
  - Identify repeating charges, their average amount, next likely timing, and annualized cost.
- How to verify it works:
  - Run targeted tests.
  - Manually inspect output against mocked recurring merchants.

## Task 9: Add anomaly detection for spending and income

- What test to write:
  - Add tests for outlier months, outlier payees, and category spikes versus trailing averages.
  - Add tests ensuring small normal variation is not flagged.
- What code to implement:
  - Add:
    - `ynab_get_spending_anomalies`
    - or a combined `ynab_get_financial_anomalies`
  - Use simple baseline heuristics first.
- How to verify it works:
  - Run targeted tests.
  - Manually confirm known anomalies are surfaced and noise is limited.

## Task 10: Standardize tool descriptions and AI calling guidance

- What test to write:
  - Add tests or assertions for tool registration metadata where practical.
  - Add tests for schema defaults if descriptions imply bounded behavior.
- What code to implement:
  - Tighten tool descriptions so an AI can infer the correct call path.
  - Emphasize compact defaults, drill-down intent, and when a tool is expensive.
- How to verify it works:
  - Review registered tool metadata.
  - Confirm descriptions make good agent behavior more likely.

## Priority Order

1. Compact serialization
2. Pagination and projection controls
3. General transaction search
4. Compact views for raw object tools
5. Financial health check
6. Emergency fund and runway
7. Debt summary
8. Recurring expense summary
9. Anomaly detection
10. Tool description cleanup

## Suggested Output Strategy

- Summary tools:
  - compact minified JSON by default
- Collection tools:
  - compact JSON with `limit`, `fields`, and optional IDs
- Raw detail tools:
  - compact projection by default, full payload only when requested

## Key Missing Tools

- `ynab_search_transactions`
- `ynab_get_financial_health_check`
- `ynab_get_emergency_fund_coverage`
- `ynab_get_cash_runway`
- `ynab_get_debt_summary`
- `ynab_get_recurring_expense_summary`
- `ynab_get_spending_anomalies`

## Expected Outcome

After these changes, an AI should be able to:

- start with one cheap summary call
- follow up with one precise filtered retrieval call
- only request full detail when needed

That should materially reduce token usage while improving the quality of finance diagnosis.
