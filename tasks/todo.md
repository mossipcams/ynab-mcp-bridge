# Latency Reduction Execution Plan - 2026-03-27

## Context

- This work is isolated in worktree `/private/tmp/ynab-mcp-latency-exec` on branch `fix/latency-exec`.
- The original checkout is in a conflicted state, so implementation will proceed only in this clean worktree.
- Execution follows strict TDD one task at a time after approval.

## Goal

Implement the revised latency-reduction plan with low-risk, measurable changes first:

- reduce follow-up tool calls
- reduce high-level summary payload size for AI consumers
- trim catalog/schema verbosity on the highest-value paths
- preserve existing JSON contracts by default

## Tasks

- [x] Task 1: Add a latency baseline harness for tool catalog and summary payload sizes
  Test to write:
  add a failing focused spec in `src/aiToolOptimization.spec.ts` or a nearby reliability/spec helper that records the current registered-tool count, `tools/list` payload size, and representative summary response sizes from controlled fixtures.
  Code to implement:
  add the smallest measurement helper(s) needed in `src/serverRuntime.ts` and/or shared test utilities so the baseline metrics can be asserted without changing production behavior.
  How to verify it works:
  run the new focused spec red first, then green, and record the measured baseline in the task results section.

- [x] Task 2: Remove `recommended_tools` from `ynab_get_financial_health_check`
  Test to write:
  update `src/financialDiagnostics.spec.ts` with a failing expectation that the health-check payload no longer includes `recommended_tools`.
  Code to implement:
  remove `recommended_tools` from `src/tools/GetFinancialHealthCheckTool.ts`.
  How to verify it works:
  run the focused financial-diagnostics spec red first, then green, then run the nearest server/discovery spec if needed to confirm no tool metadata regressions.

- [x] Task 3: Enrich `ynab_get_financial_health_check` with top follow-up-preventing fields
  Test to write:
  add failing assertions in `src/financialDiagnostics.spec.ts` for `top_overspent`, `top_underfunded`, and `top_uncategorized`.
  Code to implement:
  extend `src/tools/GetFinancialHealthCheckTool.ts` to return those additive fields from already-fetched month/transaction data.
  How to verify it works:
  run the focused health-check spec red first, then green, then manually inspect one response fixture for concise shape and ordering.

- [x] Task 4: Enrich `ynab_get_spending_summary` with single-month budget variance
  Test to write:
  add a failing focused spec in `src/financeSummaryTools.spec.ts` asserting that single-month top categories include `budgeted`, `spent`, `variance`, and `variance_pct`.
  Code to implement:
  update `src/tools/GetSpendingSummaryTool.ts` to fetch the month detail when `fromMonth === toMonth` and add the variance fields without changing multi-month behavior.
  How to verify it works:
  run the focused spending-summary spec red first, then green, then rerun the nearest summary-tool spec covering multi-month behavior.

- [x] Task 5: Add additive 30-day scheduled context to cash resilience summaries
  Test to write:
  add failing assertions in `src/financialDiagnostics.spec.ts` for `scheduled_net_next_30d` on `ynab_get_cash_runway` and `ynab_get_emergency_fund_coverage`.
  Code to implement:
  update `src/tools/GetCashRunwayTool.ts` and `src/tools/GetEmergencyFundCoverageTool.ts` to include scheduled 30-day net using cached scheduled transactions and the existing expansion/date helpers where appropriate.
  How to verify it works:
  run the focused diagnostics spec red first, then green, then rerun the nearest cash-summary specs to confirm legacy fields stay unchanged.

- [x] Task 6: Add opt-in prose output infrastructure without changing defaults
  Test to write:
  add failing assertions in `src/planToolUtils.spec.ts` for `toProseResult(...)` and for `OutputFormat` support of `"prose"`.
  Code to implement:
  extend `src/tools/planToolUtils.ts` with `prose` support and add a small shared prose formatter helper if needed.
  How to verify it works:
  run the focused plan-tool-utils spec red first, then green, then rerun any summary-tool spec touched by the helper.

- [x] Task 7: Add opt-in prose output to the highest-value broad summary tools
  Test to write:
  add failing focused specs for `format: "prose"` on:
  `ynab_get_financial_health_check`, `ynab_get_monthly_review`, `ynab_get_budget_health_summary`, `ynab_get_spending_summary`, `ynab_get_cash_flow_summary`, and `ynab_get_upcoming_obligations`.
  Code to implement:
  add `format` handling to those tool schemas and executors while keeping default output as current compact JSON.
  How to verify it works:
  run the focused prose-format specs red first, then green, then compare JSON vs prose payload sizes for the representative tools.

- [x] Task 8: Trim schema/description verbosity on the highest-value shared paths and re-measure
  Test to write:
  add a failing focused spec in `src/aiToolOptimization.spec.ts` or `src/serverFactory.spec.ts` asserting a reduced `tools/list` payload size or trimmed field-description strings for the targeted shared schemas.
  Code to implement:
  shorten repetitive descriptions in `src/tools/transactionCollectionToolUtils.ts` and the selected high-value summary tools, avoiding unsupported “no follow-up needed” claims.
  How to verify it works:
  run the focused optimization/spec red first, then green, rerun the full targeted suite from prior tasks, and capture before/after measurements for tool count, `tools/list` size, and representative response sizes.

## PR Closeout

- After all approved TDD tasks are complete and verified, use the `pr-lifecycle` skill to create or update the PR against `mossipcams/ynab-mcp-bridge`.
- PR title should use a releasable Conventional Commit format aligned to the final change set, likely `feat:` or `fix:`.

## Results

- Task 1 completed:
  Added `getToolCatalogMetrics()` in `src/serverRuntime.ts` and a focused baseline spec in `src/aiToolOptimization.spec.ts`.
  Recorded current baseline measurements in the controlled fixture scenario:
  `tool_count=47`, `tools_list_bytes=39929`, `tools_list_chars=39929`,
  `financial_health_check_bytes=841`, `financial_snapshot_bytes=425`.

- Task 2 completed:
  Removed `recommended_tools` from `ynab_get_financial_health_check`.
  Focused TDD proof:
  `src/financialDiagnostics.spec.ts` failed while the field still existed and passed once it was removed.

- Task 3 completed:
  Added `top_overspent`, `top_underfunded`, and `top_uncategorized` to the health-check payload without adding new reads.
  Focused TDD proof:
  the health-check diagnostics spec failed on the missing fields and passed after the additive payload change.

- Task 4 completed:
  Added single-month `budgeted`, `spent`, `variance`, and `variance_pct` details to `ynab_get_spending_summary` top categories.
  Focused TDD proof:
  the new single-month spending-summary spec failed until `getPlanMonth(...)` was conditionally fetched and the enriched category rows were returned.

- Task 5 completed:
  Added `scheduled_net_next_30d` to `ynab_get_cash_runway` and `ynab_get_emergency_fund_coverage` via a shared scheduled-occurrence helper.
  Focused TDD proof:
  the four cash-summary diagnostics assertions failed while the field was missing and passed once the shared scheduled-net helper was wired in.

- Task 6 completed:
  Extended shared output support with `OutputFormat = "compact" | "pretty" | "prose"` and added `toProseResult(...)`.
  Focused TDD proof:
  `src/planToolUtils.spec.ts` failed while prose text was JSON-quoted and while `toProseResult(...)` was missing, then passed after the helper update.

- Task 7 completed:
  Added opt-in `format: "prose"` support to:
  `ynab_get_financial_health_check`, `ynab_get_monthly_review`, `ynab_get_budget_health_summary`, `ynab_get_spending_summary`, `ynab_get_cash_flow_summary`, and `ynab_get_upcoming_obligations`.
  Added shared prose formatting in `src/tools/proseFormatUtils.ts`.
  Focused TDD proof:
  six prose-format specs failed while the tools still returned compact JSON and passed after the opt-in prose branch was added with compact JSON preserved as the default.

- Task 8 completed:
  Trimmed repetitive schema descriptions in the shared transaction collection schema, shortened `ynab_search_transactions` schema text, and tightened the six high-value summary-tool descriptions and date/plan field descriptions.
  Focused TDD proof:
  `src/aiToolOptimization.spec.ts` failed on the old verbose strings and passed after the targeted schema/description trims.
  Final measurements from the built code:
  `tool_count=47`,
  `tools_list_bytes=38754` (down from `39929`, about `-2.9%`),
  `financial_health_check_compact=908 bytes`,
  `financial_health_check_prose=433 bytes`,
  `monthly_review_compact=434 bytes`,
  `monthly_review_prose=149 bytes`.

- Final verification completed:
  `npx vitest run src/aiToolOptimization.spec.ts src/financialDiagnostics.spec.ts src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/planToolUtils.spec.ts`
  passed with `46` tests.
  `npm run build` passed.

Plan ready. Approve to proceed.
