# Finance Summary Priorities Plan

## Goal

Implement the three highest-leverage improvements in this order:

- add a range-based net worth trajectory tool so monthly progress does not require repeated snapshot calls
- add a one-call monthly review tool that bundles the key "how did I do this month?" metrics
- tighten tool descriptions so LLMs stop misreading `assigned_vs_spent` as a discipline score instead of a buffering signal

## Constraints And Notes

- Work is isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-finance-summary` on branch `feat/finance-summary-priorities` from `origin/main`.
- The original checkout remains untouched because it had unrelated local changes on a non-`main` branch.
- The repo instructions say not to modify files in a `tests/` directory unless explicitly asked to. The existing Vitest files are under `src/`, so targeted spec updates there are allowed.
- The installed YNAB SDK types show `getPlanMonth` returns month/category data, not month-by-month account balances. The net worth trajectory tool therefore needs to derive historical month-end balances from current account balances plus transaction history, rather than reading a native historical balances endpoint.

## Assumptions

- Proposed tool names:
  - `ynab_get_net_worth_trajectory`
  - `ynab_get_monthly_review`
- Net worth trajectory should return month-by-month `net_worth`, `liquid_cash`, and `debt` for an inclusive month range, plus a compact trend summary.
- Historical balances should be reconstructed by walking backward from current account balances using account-linked transaction deltas, including closed but not deleted accounts so prior months are not silently undercounted.
- Monthly review should optimize for one coherent LLM-facing payload, not for reproducing every field from the existing summary tools.

## Tasks

- [x] Task 1: Add failing coverage for monthly net worth trajectory reconstruction and registration
  Test to write:
  Extend `src/financeSummaryTools.spec.ts` with a red test for `ynab_get_net_worth_trajectory` that uses current account balances plus dated transactions to prove the tool reconstructs month-end `net_worth`, `liquid_cash`, and `debt` across a range.
  Extend `src/serverFactory.spec.ts` so it fails unless the tool registry includes the new tool name and metadata.
  The fixture should cover:
  current positive and negative account balances,
  transfers between accounts that should not change net worth,
  debt paydown that changes debt and net worth,
  and a closed account whose prior-month balance still matters.
  Code to implement:
  No production code in this task. Only the failing specs that pin the intended historical-balance behavior and registry surface.
  How to verify it works:
  Run `npx vitest run src/financeSummaryTools.spec.ts src/serverFactory.spec.ts` and show the failure proving the tool is missing and the month-by-month balance expectations are not yet implemented.
  Result:
  Added a red registry expectation in `src/serverFactory.spec.ts` and a red trajectory fixture in `src/financeSummaryTools.spec.ts`.
  Verified red with:
  `npx vitest run src/financeSummaryTools.spec.ts src/serverFactory.spec.ts`
  which failed because the registry still exposes 45 tools and `ynab_get_net_worth_trajectory` is not registered yet.

- [x] Task 2: Implement `ynab_get_net_worth_trajectory`
  Test to write:
  Reuse the red tests from Task 1.
  Code to implement:
  Add `src/tools/GetNetWorthTrajectoryTool.ts`.
  Add shared helpers in `src/tools/financeToolUtils.ts` only if needed for:
  inclusive month iteration,
  month-end grouping,
  historical balance reconstruction from current balances plus transaction deltas,
  and aggregate rollups for `net_worth`, `liquid_cash`, and `debt`.
  Register the tool in `src/server.ts`.
  Keep the output compact, likely with:
  `from_month`,
  `to_month`,
  `start_net_worth`,
  `end_net_worth`,
  `change_net_worth`,
  and `months`.
  How to verify it works:
  Re-run `npx vitest run src/financeSummaryTools.spec.ts src/serverFactory.spec.ts` and show the new tests passing.
  Then run `npx vitest run src/financeToolUtils.spec.ts src/financialDiagnostics.spec.ts` to prove the new helpers do not regress existing finance behavior.
  Result:
  Added `src/tools/GetNetWorthTrajectoryTool.ts`, registered it in `src/server.ts`, and introduced focused month/balance helpers in `src/tools/financeToolUtils.ts` for month normalization, month-end checks, and historical balance reconstruction.
  Verified green with:
  `npx vitest run src/financeSummaryTools.spec.ts src/serverFactory.spec.ts`
  and
  `npx vitest run src/financeToolUtils.spec.ts src/financialDiagnostics.spec.ts`

- [x] Task 3: Add failing coverage for a bundled monthly review payload
  Test to write:
  Extend `src/financeAdvancedTools.spec.ts` with a red test for `ynab_get_monthly_review` that fails unless a single tool call returns the core month answer set:
  month identity,
  income,
  inflow/outflow/net flow,
  assigned/spent/assigned_vs_spent,
  ready_to_assign,
  overspending and underfunding counts/totals,
  top spending rollups,
  and optional anomalies when a trailing baseline exists.
  Extend `src/serverFactory.spec.ts` so the registry expectations fail unless the new tool is exposed.
  Code to implement:
  No production code in this task. Only the failing specs that define the minimal high-value monthly review contract.
  How to verify it works:
  Run `npx vitest run src/financeAdvancedTools.spec.ts src/serverFactory.spec.ts` and show the failure caused by the missing tool and missing bundled payload.
  Result:
  Added a red monthly-review contract in `src/financeAdvancedTools.spec.ts` and expanded the registry expectations in `src/serverFactory.spec.ts`.
  Verified red with:
  `npx vitest run src/financeAdvancedTools.spec.ts src/serverFactory.spec.ts`
  which failed because the registry still exposed 46 tools and `ynab_get_monthly_review` was not registered yet.

- [x] Task 4: Implement `ynab_get_monthly_review`
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Add `src/tools/GetMonthlyReviewTool.ts`.
  Reuse existing fetch patterns and shared helpers where practical, but avoid a thin wrapper that only reparses five existing MCP tool outputs.
  Fetch the smallest coherent dataset needed for one-pass assembly, likely:
  current month detail,
  month-range transactions,
  category metadata if grouping is needed,
  and prior month detail only when anomaly comparison is requested by the tool contract.
  Keep the payload coherent and compact so it materially reduces prompt assembly overhead versus separate summary tool calls.
  Register the tool in `src/server.ts`.
  How to verify it works:
  Re-run `npx vitest run src/financeAdvancedTools.spec.ts src/serverFactory.spec.ts` and show the new tests passing.
  Then run `npx vitest run src/financeSummaryTools.spec.ts src/aiToolOptimization.spec.ts` to confirm the new bundling work does not break existing finance-summary expectations.
  Result:
  Added `src/tools/GetMonthlyReviewTool.ts` and registered it in `src/server.ts`.
  The tool now assembles one compact payload from current month detail, in-month transactions, and a short trailing month baseline for anomalies.
  Verified green with:
  `npx vitest run src/financeAdvancedTools.spec.ts src/serverFactory.spec.ts`
  and
  `npx vitest run src/financeSummaryTools.spec.ts src/aiToolOptimization.spec.ts`

- [x] Task 5: Add failing coverage for YNAB semantics wording around `assigned_vs_spent`
  Test to write:
  Add or extend a focused quality/spec assertion in `src/serverFactory.spec.ts` or `src/codeQuality.spec.ts` so it fails unless the descriptions for the relevant finance tools explain that `assigned_vs_spent` reflects buffering or timing behavior and is not a budget-discipline score.
  At minimum, pin the descriptions for:
  `ynab_get_financial_snapshot`,
  `ynab_get_budget_health_summary`,
  `ynab_get_cash_flow_summary`,
  and `ynab_get_monthly_review` if Task 4 adds it.
  Code to implement:
  No production code in this task. Only the red documentation/metadata assertions.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts src/codeQuality.spec.ts` and show the failure proving the current descriptions do not give LLMs the needed semantic guidance.
  Result:
  Added a focused registry-level wording assertion in `src/serverFactory.spec.ts` for the finance tools that expose `assigned_vs_spent`.
  Verified red with:
  `npx vitest run src/serverFactory.spec.ts`
  which failed because the existing finance-tool descriptions did not mention buffering or timing semantics.

- [x] Task 6: Implement the tool-description and README guidance pass
  Test to write:
  Reuse the red assertions from Task 5.
  Code to implement:
  Update the relevant tool descriptions in `src/tools/*.ts` so the registry surface consistently explains the YNAB semantics.
  Add a short README note in the finance-summary/tool coverage area clarifying that `assigned_vs_spent` often reflects paycheck timing and budget buffering rather than "discipline".
  Keep this scoped to descriptive guidance, not logic changes.
  How to verify it works:
  Re-run `npx vitest run src/serverFactory.spec.ts src/codeQuality.spec.ts` and show the wording assertions passing.
  Then inspect the registered tool metadata through the existing registrar coverage to confirm the clarified descriptions are actually exposed at runtime.
  Result:
  Updated the descriptions in `GetFinancialSnapshotTool`, `GetBudgetHealthSummaryTool`, `GetCashFlowSummaryTool`, and `GetMonthlyReviewTool`, and added a short README note under tool coverage.
  Verified green with:
  `npx vitest run src/serverFactory.spec.ts`
  and the registry assertions confirm the clarified descriptions are exposed through the runtime tool metadata.

- [x] Task 7: Do final verification on the expanded finance-summary surface
  Test to write:
  No new tests in this task. Use the approved red/green specs as the proof.
  Code to implement:
  No new production behavior unless verification exposes an issue tightly coupled to the approved scope. If that happens, stop and re-plan before expanding scope.
  How to verify it works:
  Run at minimum:
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/serverFactory.spec.ts src/financeToolUtils.spec.ts src/financialDiagnostics.spec.ts src/aiToolOptimization.spec.ts src/codeQuality.spec.ts`
  and
  `npm run typecheck`
  Add a short results section to this file before closing out.
  Result:
  Final verification passed with:
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/serverFactory.spec.ts src/financeToolUtils.spec.ts src/financialDiagnostics.spec.ts src/aiToolOptimization.spec.ts src/codeQuality.spec.ts`
# Calculation Logic Remediation Plan

## Goal

Fix the highest-impact YNAB calculation issues from the audit so the finance analytics tools use consistent money semantics, stop misclassifying transfers and refunds, and expose outputs that an LLM can interpret correctly.

## Constraints And Notes

- Work is isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-calculation-logic-remediation` on branch `fix/calculation-logic-remediation` from `origin/main`.
- Repo rules require TDD for code changes, one task at a time, with a stop after each task.
- The finance tools currently mix month snapshots, raw transactions, scheduled transactions, and current category metadata; several fixes will need shared helpers so the same YNAB rules are not reimplemented inconsistently.
- The YNAB SDK confirms `transactions.getTransactions(planId, sinceDate, ...)` is a since-date endpoint, while `getTransactionsByMonth` is the month-scoped endpoint. Future implementation should prefer the month endpoint when the tool contract is month-specific.

## Assumptions

- The first remediation pass should prioritize semantic correctness over adding new tools.
- Credit card payment categories should not count as discretionary spending in spending, anomaly, or ratio tools.
- Positive category activity should not automatically be treated as spending; refunds should either reduce spend or be surfaced separately.
- Tools that forecast upcoming obligations should separate due outflows from expected inflows instead of mixing them into one obligation total.
- We can update existing Vitest specs under `src/` because they are not inside a `tests/` directory.

## Tasks

- [x] Task 1: Add failing coverage for shared money-classification semantics
  Test to write:
  Add focused red tests in `src/financeToolUtils.spec.ts` and the affected finance specs proving that:
  negative expense activity counts as spend,
  positive refund activity does not inflate spend,
  transfers are excluded from expense/income classification,
  and credit card payment categories are excluded from spending-style summaries.
  Code to implement:
  No production code in this task. Only failing specs that pin the desired behavior for refunds, transfers, and credit-card-payment handling.
  How to verify it works:
  Run `npx vitest run src/financeToolUtils.spec.ts src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the failures proving the current helpers and tools misclassify these cases.
  Result:
  Added red coverage in:
  `src/financeToolUtils.spec.ts`,
  `src/financeSummaryTools.spec.ts`,
  `src/financeAdvancedTools.spec.ts`,
  and `src/financialDiagnostics.spec.ts`.
  Verified red with:
  `npx vitest run src/financeToolUtils.spec.ts src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`
  which failed because:
  `toSpentMilliunits` still converts positive activity into spend,
  `ynab_get_financial_snapshot` still reports positive month activity as spending,
  `ynab_get_category_trend_summary` still counts positive refund activity as spend,
  and `ynab_get_spending_anomalies` still flags credit card payment categories as spending anomalies.

- [x] Task 2: Implement shared money classification and replace `Math.abs(activity)` spending logic
  Test to write:
  Reuse the failing specs from Task 1.
  Code to implement:
  Add shared helpers in `src/tools/financeToolUtils.ts` for sign-aware spending, refund treatment, transfer exclusion, and optional credit-card-payment exclusion.
  Update these tools to use the shared logic instead of raw `Math.abs(...)`:
  `GetFinancialSnapshotTool.ts`,
  `GetBudgetHealthSummaryTool.ts`,
  `GetCashFlowSummaryTool.ts`,
  `GetCategoryTrendSummaryTool.ts`,
  `GetSpendingAnomaliesTool.ts`,
  and `GetBudgetRatioSummaryTool.ts`.
  How to verify it works:
  Re-run the Task 1 Vitest command and show the new tests passing.
  Then run the broader touched suite:
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts src/financeToolUtils.spec.ts`.
  Result:
  Updated `src/tools/financeToolUtils.ts` so spend-style summaries only treat negative activity as spending and added a shared credit-card-payment category helper.
  Updated `src/tools/GetSpendingAnomaliesTool.ts` to exclude categories in the `Credit Card Payments` group from anomaly detection.
  Verified green with:
  `npx vitest run src/financeToolUtils.spec.ts src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`
  and
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts src/financeToolUtils.spec.ts`

- [x] Task 3: Add failing coverage for month-scoped cleanup and health excluding transfer noise
  Test to write:
  Extend `src/financeAdvancedTools.spec.ts` and `src/financialDiagnostics.spec.ts` so they fail unless month cleanup and health counts exclude on-budget transfers from uncategorized backlog and other cleanup metrics.
  Include a fixture where a transfer is uncategorized by design and must not be reported as user cleanup work.
  Code to implement:
  No production code in this task. Only failing tests for transfer-aware cleanup semantics.
  How to verify it works:
  Run `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the failures proving transfer transactions are currently over-counted.
  Result:
  Added red coverage in `src/financeAdvancedTools.spec.ts` and `src/financialDiagnostics.spec.ts` proving that uncategorized transfer transactions were still being counted as cleanup backlog.
  Verified red with:
  `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`
  which failed because both budget cleanup and financial health metrics counted transfer transactions as uncategorized, unapproved, and uncleared work items.

- [x] Task 4: Implement transfer-aware cleanup and health query fixes
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Update `GetBudgetCleanupSummaryTool.ts` and `GetFinancialHealthCheckTool.ts` to exclude transfer transactions from cleanup counts.
  Where the contract is explicitly month-based, prefer month-specific transaction fetches or equivalent exact month filtering with the transfer-aware classifier.
  How to verify it works:
  Re-run `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the red tests turning green.
  Then run `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` to confirm no finance-summary regression.
  Result:
  Added a shared `isTransferTransaction` helper in `src/tools/financeToolUtils.ts` and used it in `src/tools/GetBudgetCleanupSummaryTool.ts` and `src/tools/GetFinancialHealthCheckTool.ts`.
  Verified green with:
  `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`
  and
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`

- [x] Task 5: Add failing coverage for true-income versus generic positive inflow semantics
  Test to write:
  Extend `src/financeAdvancedTools.spec.ts` and, if helpful, add focused helper coverage so `ynab_get_income_summary` fails unless it distinguishes real income from refund/reimbursement-like positive inflows.
  The fixture should cover:
  paycheck income,
  a merchant refund,
  and a positive non-transfer inflow that should not be labeled as income without an explicit rule.
  Code to implement:
  No production code in this task. Only failing tests that define the intended income contract.
  How to verify it works:
  Run `npx vitest run src/financeAdvancedTools.spec.ts` and show the failure demonstrating the current tool over-counts positive inflows as income.
  Result:
  Tightened the existing income fixtures so true income is explicitly categorized as `Inflow: Ready to Assign`, then added red coverage proving that refunds and generic positive inflows were still counted as income.
  Verified red with:
  `npx vitest run src/financeAdvancedTools.spec.ts`
  which failed because `ynab_get_income_summary` still counted a positive refund and a generic positive inflow in monthly income totals.

- [x] Task 6: Implement tighter income semantics and expose any unavoidable ambiguity
  Test to write:
  Reuse the failing specs from Task 5.
  Code to implement:
  Update `GetIncomeSummaryTool.ts` to use a stricter income classifier.
  If the available API data cannot reliably separate every positive inflow type, surface that limitation explicitly in the payload or tool description rather than silently calling all positive inflows "income".
  Keep the implementation minimal and grounded in YNAB fields that actually exist.
  How to verify it works:
  Re-run `npx vitest run src/financeAdvancedTools.spec.ts` and show the tests passing.
  Then run the broader finance specs to confirm no regression in downstream summaries that reference income.
  Result:
  Added a shared `isReadyToAssignInflowCategory` helper in `src/tools/financeToolUtils.ts` and updated `src/tools/GetIncomeSummaryTool.ts` so only positive, non-transfer `Inflow: Ready to Assign` transactions count as income.
  Verified green with:
  `npx vitest run src/financeAdvancedTools.spec.ts`
  and
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts src/financeToolUtils.spec.ts`

- [x] Task 7: Add failing coverage for obligation-window forecasting semantics
  Test to write:
  Extend `src/financeAdvancedTools.spec.ts` and `src/financialDiagnostics.spec.ts` so they fail unless:
  upcoming obligation outputs separate due outflows from expected inflows,
  transfer-like scheduled transactions are excluded,
  and repeated schedules inside a 30-day window are not silently undercounted.
  Code to implement:
  No production code in this task. Only failing specs that define the forecast contract.
  How to verify it works:
  Run `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the failures proving the current obligation math mixes inflows with obligations and only counts `date_next`.
  Result:
  Added red coverage in `src/financeAdvancedTools.spec.ts` and `src/financialDiagnostics.spec.ts` proving that:
  recurring weekly scheduled outflows were undercounted,
  transfer-like schedules were still included,
  and obligation counts still mixed inflows with true due outflows.
  Verified red with:
  `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`
  which failed because the current implementation only counted each schedule's `date_next` and did not separate inflow counts from obligation counts.

- [x] Task 8: Implement expanded obligation forecasting and align health-check cash-risk inputs
  Test to write:
  Reuse the failing specs from Task 7.
  Code to implement:
  Update `GetUpcomingObligationsTool.ts` to expand recurring scheduled transactions across the 7/14/30 day windows, exclude transfers, and return outflows separately from inflows.
  Update `GetFinancialHealthCheckTool.ts` so its `upcoming_30d_net` or equivalent risk input is based on the corrected obligation model.
  How to verify it works:
  Re-run `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the new tests passing.
  Then run the broader finance suite to confirm the health-check output remains stable apart from the intentional semantic correction.
  Result:
  Added shared scheduled-occurrence expansion in `src/tools/financeToolUtils.ts` and reused it in `src/tools/GetUpcomingObligationsTool.ts` and `src/tools/GetFinancialHealthCheckTool.ts`.
  `ynab_get_upcoming_obligations` now:
  expands recurring schedules across the 30-day horizon,
  excludes transfers,
  separates `obligation_count` from `expected_inflow_count`,
  and reports top due items by expanded occurrence date.
  `ynab_get_financial_health_check` now bases `upcoming_30d_net` on the same expanded schedule model.
  Verified green with:
  `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`
  and
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts src/financeToolUtils.spec.ts`

- [x] Task 9: Add failing coverage for ratio and trend labels that currently overstate meaning
  Test to write:
  Add focused assertions in `src/financeAdvancedTools.spec.ts`, `src/financeSummaryTools.spec.ts`, `src/serverFactory.spec.ts`, or `src/codeQuality.spec.ts` so they fail unless:
  live finance tool descriptions explain timing and classification semantics explicitly,
  `assigned_vs_spent` fields are described as timing/buffering metrics rather than discipline scores,
  and category/group trend summaries surface enough context to avoid silent history rewrites when group names change.
  Code to implement:
  No production code in this task. Only red assertions for contract wording and output clarity.
  How to verify it works:
  Run the targeted Vitest specs and show the failures proving the current tool contracts are semantically too loose.
  Result:
  Adapted this task to the current branch state, where `ynab_get_70_20_10_summary` is already removed.
  Added red coverage in `src/serverFactory.spec.ts` for live finance-tool descriptions and in `src/financeAdvancedTools.spec.ts` for category-group trend scope metadata.
  Verified red with:
  `npx vitest run src/serverFactory.spec.ts src/financeAdvancedTools.spec.ts`
  which failed because the descriptions still overstated semantics and category-group trend output did not expose name-based matching.

- [x] Task 10: Implement contract/description cleanup for ratio, trend, and snapshot semantics
  Test to write:
  Reuse the failing specs from Task 9.
  Code to implement:
  Update the affected tool descriptions and payload labels in:
  `GetCategoryTrendSummaryTool.ts`,
  `GetCashFlowSummaryTool.ts`,
  `GetBudgetHealthSummaryTool.ts`,
  `GetFinancialSnapshotTool.ts`,
  `GetIncomeSummaryTool.ts`,
  and `GetUpcomingObligationsTool.ts`.
  Keep this task focused on truthful semantics and output shape, not on adding brand-new analytics.
  How to verify it works:
  Re-run the targeted specs from Task 9 and show them passing.
  Then inspect the registered tool metadata through the existing registrar coverage to confirm the clarified contracts are exposed at runtime.
  Result:
  Updated live finance tool descriptions so they explicitly describe timing/buffering semantics, cash-flow versus savings semantics, `Inflow: Ready to Assign` income classification, and obligation windows as due outflows plus expected inflows excluding transfers.
  Updated `GetCategoryTrendSummaryTool.ts` so group-based trend payloads expose `scope.match_basis: "category_group_name"`.
  Verified green with:
  `npx vitest run src/serverFactory.spec.ts src/financeAdvancedTools.spec.ts`

- [x] Task 11: Final verification on the audited analytics surface
  Test to write:
  No new tests in this task. Use the approved red/green specs as proof.
  Code to implement:
  No new production behavior unless verification exposes a tightly coupled issue. If that happens, stop and re-plan before continuing.
  How to verify it works:
  Run at minimum:
  `npx vitest run src/financeToolUtils.spec.ts src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts src/serverFactory.spec.ts`
  and
  `npm run typecheck`
  Add a short results section to this file before closing out implementation.
  Result:
  Final verification passed with:
  `npx vitest run src/financeToolUtils.spec.ts src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts src/serverFactory.spec.ts`
  and
  `npm run typecheck`

## Review Bar

- A single MCP tool call can answer month-by-month progress over a date range with `net_worth`, `liquid_cash`, and `debt`.
- Historical monthly balances are reconstructed in a way that handles transfers correctly and does not erase closed-account history.
- A single MCP tool call can answer "how did I do this month?" with a coherent payload rather than requiring the LLM to stitch together multiple fragments.
- Tool descriptions explicitly steer the model away from misreading `assigned_vs_spent` as a behavior score.
- Focused specs and runtime-registry verification provide proof for the new tool surface and the documentation changes.

Plan ready. Approve to proceed.

## Results

- Added `ynab_get_net_worth_trajectory` for one-call month-by-month `net_worth`, `liquid_cash`, and `debt` across an inclusive range.
- Added `ynab_get_monthly_review` for a one-call month summary that bundles income, cash flow, budget health, top spending, and notable spending changes.
- Added shared month and historical-balance helpers in `src/tools/financeToolUtils.ts` to support the new finance summary surface.
- Updated registry coverage in `src/serverFactory.spec.ts` and red/green tool coverage in `src/financeSummaryTools.spec.ts` and `src/financeAdvancedTools.spec.ts`.
- Clarified `assigned_vs_spent` semantics in the tool descriptions and `README.md` so MCP clients and LLMs get the right interpretation by default.
- Spending-like fields treat refunds, transfers, and credit-card-payment shuffling correctly.
- Cleanup-style tools do not tell the LLM that normal transfers are uncategorized user mistakes.
- Income outputs are either meaningfully constrained to real income or explicitly labeled when ambiguity remains.
- Obligation windows reflect the full scheduled horizon, not just each item's next occurrence.
- Tool descriptions and payload labels are truthful enough that an LLM can answer finance questions without silently overstating what the server actually computed.

## Results

- Spend-style helpers now treat only negative activity as spending and exclude `Credit Card Payments` categories from anomaly detection.
- Cleanup and health metrics now exclude transfer transactions from uncategorized, unapproved, and uncleared backlog counts.
- Income summaries now count only positive, non-transfer `Inflow: Ready to Assign` transactions as income.
- Upcoming obligations now expand recurring schedules across the full horizon, exclude transfers, and separate outflow obligation counts from expected inflow counts.
- Health-check `upcoming_30d_net` now uses the same expanded schedule model as the obligations tool.
- Tool descriptions now explicitly explain timing/buffering semantics and income/obligation classification boundaries.
- Category-group trend summaries now expose `scope.match_basis: "category_group_name"` so name-based matching is visible in the payload.

# Remove 70/20/10 Tool Plan

## Goal

Remove the `ynab_get_70_20_10_summary` tool from the server registry so it is no longer exposed, and clean up the implementation and coverage that only exist for that tool.

## Constraints And Notes

- Work is isolated in `/Users/matt/Desktop/Projects/ynab-mcp-bridge-remove-70-20-10` on branch `fix/remove-70-20-10-tool` from `origin/main`.
- The original checkout remains untouched because it had unrelated local changes on a non-`main` branch.

## Tasks

- [x] Task 1: Add a failing registry test that proves the tool is still exposed today
  Test to write:
  Update `src/serverFactory.spec.ts` so it fails unless the registered tool count and tool name lists exclude `ynab_get_70_20_10_summary`, and so the explicit registration assertion no longer expects the `Get 70/20/10 Summary` tool metadata.
  Code to implement:
  No production code in this task. Only the spec changes needed to make removal expectations explicit.
  How to verify it works:
  Run `npm test -- --run src/serverFactory.spec.ts` and show the failure caused by the tool still being registered.

- [x] Task 2: Remove the tool from the server registry and implementation surface
  Test to write:
  Reuse the failing expectations from Task 1 as the red test.
  Code to implement:
  Remove the `GetBudgetRatioSummaryTool` import and registration from `src/server.ts`, then remove the now-unused implementation file `src/tools/GetBudgetRatioSummaryTool.ts`.
  How to verify it works:
  Re-run `npm test -- --run src/serverFactory.spec.ts` and show it passing. Then run `npm run typecheck` to confirm there are no dangling imports or type errors from the removal.

- [x] Task 3: Remove direct tool coverage that no longer applies and verify behavior stays clean
  Test to write:
  Update `src/financeAdvancedTools.spec.ts` and `src/pureV4Refactor.spec.ts` by removing expectations that require the `70/20/10` tool.
  Code to implement:
  Delete the obsolete spec block and file-list entry, plus any now-unused imports.
  How to verify it works:
  Run `npm test -- --run src/financeAdvancedTools.spec.ts src/pureV4Refactor.spec.ts` and then `npm run build` if the targeted tests and typecheck pass, to confirm the repo still compiles without the removed tool.

## Review Bar

- The tool name is absent from the runtime registry.
- No source file imports or references the removed tool in `src/`.
- Targeted tests, typecheck, and build provide proof that the removal is complete.

## Results

- Removed the `ynab_get_70_20_10_summary` registry entry and deleted the corresponding source tool module.
- Removed obsolete spec coverage and tool-file inventory expectations that referenced the deleted tool.
- Verified with:
  `npm test -- --run src/serverFactory.spec.ts`
  `npm run typecheck`
  `npm test -- --run src/financeAdvancedTools.spec.ts src/pureV4Refactor.spec.ts`
  `npm run build`

# Type Discipline Implementation Plan

## Goal

Implement a zero-tooling-cost type-safety upgrade that adds:

- Branded types for high-value identifier boundaries
- Readonly-by-default type design for shared/public shapes
- Explicit TS 5.9-era strict compiler options
- Explicit ESLint enforcement for `@typescript-eslint/consistent-type-assertions` and the `@typescript-eslint/no-unsafe-*` family

## Scope

This first slice will enforce the discipline in config and shared/public types, then migrate the highest-leverage ID and collection boundaries. It will not try to nominalize every internal string in one pass.

## Tasks

- [x] Task 1: Add quality guardrail tests for strict config and lint policy
  Test to write:
  Add or extend a repo-quality spec in `src/codeQuality.spec.ts` that fails unless:
  `package.json` declares TypeScript 5.9,
  `tsconfig.json` contains the agreed strictness flags,
  `eslint.config.mjs` contains `@typescript-eslint/consistent-type-assertions`,
  and the effective lint policy still includes the `@typescript-eslint/no-unsafe-*` family.
  Code to implement:
  No production code in this task. Only test coverage that codifies the desired guardrails.
  How to verify it works:
  Run the new targeted Vitest spec and show it failing before config changes. Confirm the failure points at the missing flags/rules rather than unrelated issues.

- [x] Task 2: Tighten TypeScript compiler configuration to the agreed strict baseline
  Test to write:
  Use the failing guardrail test from Task 1 as the red test for config requirements.
  Code to implement:
  Update `package.json` and `tsconfig.json` to the intended baseline:
  pin or bump `typescript` to a 5.9 range,
  keep `strict: true`,
  and add the missing strictness flags such as `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, and `noImplicitOverride` if they fit the codebase cleanly.
  Avoid adding new tools or build steps.
  How to verify it works:
  Re-run the targeted guardrail spec to green, then run `npm run typecheck` to expose any real breakages introduced by the stricter config.

- [x] Task 3: Make ESLint policy explicit for type assertions and unsafe operations
  Test to write:
  Extend the same quality spec so it fails unless `eslint.config.mjs` explicitly sets `@typescript-eslint/consistent-type-assertions` to `"never"` and preserves the type-aware unsafe-operation rules.
  Code to implement:
  Update `eslint.config.mjs` to add explicit rule entries instead of relying only on inherited presets.
  Keep the current test-file overrides intact unless the stricter rules force a small, justified adjustment.
  How to verify it works:
  Run the targeted spec again, then run `npm run lint`. If lint surfaces new unsafe patterns, capture them and stop to re-plan if the fix set expands beyond the planned slice.

- [x] Task 4: Introduce shared branded-type primitives and readonly-first helper types
  Test to write:
  Add a compile-time contract file in `src/` that uses `// @ts-expect-error` and assignability checks to prove:
  plain `string` is not assignable to branded IDs,
  branded IDs remain usable as strings where intended,
  readonly collections reject mutation,
  and object helper types expose readonly properties by default.
  Code to implement:
  Add a small shared type module, for example `src/types/brand.ts` or similar, with:
  a generic `Brand<T, Name>` helper,
  branded aliases for the first set of IDs,
  and readonly utility aliases for arrays/records/public DTOs.
  Keep it purely type-level with zero runtime cost.
  How to verify it works:
  Run `npm run typecheck` and show the contract file passing. Confirm no emitted runtime code or tooling additions are needed.

- [x] Task 5: Migrate the highest-value public/domain boundaries to the new types
  Test to write:
  Add or extend targeted specs around the most important entry points, likely config resolution and one or two representative tools/helpers, so they fail when mutable arrays or raw strings are still accepted where branded/readonly types should be used.
  Prefer adding specs under `src/*.spec.ts` rather than any `tests/` directory.
  Code to implement:
  Update the shared/public shapes first, likely including:
  config-facing `planId` handling,
  selected tool input types such as `planId`, `accountId`, `categoryId`, `payeeId`, and `transactionId`,
  and readonly arrays/records in exported types like request context and profile/config structures.
  Constrain the migration to the highest-leverage boundaries so the change stays reviewable.
  How to verify it works:
  Run the targeted specs for the migrated modules, then `npm run typecheck` to prove the branded/readonly constraints hold across real call sites.

- [~] Task 6: Clean up strictness fallout and complete full verification
  Test to write:
  Use the existing failing tests/lint/typecheck output as the red signal for any fallout caused by Tasks 2 through 5.
  Do not weaken assertions; fix implementation and types instead.
  Code to implement:
  Apply the smallest necessary follow-up changes to satisfy the stricter compiler/lint rules and readonly/branded contracts.
  This may include replacing unsafe assertions, narrowing `unknown` safely, and updating mutable collection types to readonly variants.
  How to verify it works:
  Run, at minimum:
  `npm run test -- --run src/codeQuality.spec.ts`
  targeted module specs touched by the migration,
  `npm run lint`,
  `npm run typecheck`,
  and `npm run build` if typecheck/lint pass cleanly.
  Add a short results section to this file before closing out.

## Notes

- Use TDD for every non-Markdown task after approval: failing test first, then minimal implementation, then proof.
- Do not modify files under a `tests/` directory.
- If stricter TS flags create repo-wide churn beyond the planned slice, stop after the first failing proof, summarize the expansion, and re-plan before continuing.

## Results

- Added guardrail coverage in `src/codeQuality.spec.ts` for TS 5.9, strict compiler flags, explicit `consistent-type-assertions`, and effective `no-unsafe-*` lint rules.
- Tightened `tsconfig.json` with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, and `noImplicitOverride`.
- Made ESLint explicitly forbid type assertions in main TS files while keeping spec-file overrides.
- Added shared zero-runtime branded and readonly helper types in `src/typeUtils.ts`, branded YNAB IDs in `src/ynabTypes.ts`, and compile-time contracts in `src/typeUtils.contract.ts`.
- Migrated high-value boundaries toward readonly/branded usage across config/runtime context, client profile types, plan resolution, and several finance/helper modules.
- Reworked `src/server.ts` into an explicit registry that preserves source-level clarity without whole-module registry indirection.
- Fixed `src/ynabApi.ts` to match the current YNAB SDK `_configuration` shape and keep runtime config normalization branded internally.

## Verification

- Passed: `npm run test -- --run src/codeQuality.spec.ts`
- Passed: `npm run test -- --run src/ynabApi.spec.ts src/config.spec.ts src/serverFactory.spec.ts`
- Passed: `npm run test -- --run src/planReadTools.spec.ts`
- Passed: `npm run test -- --run src/httpServer.spec.ts`
- Attempted: focused ESLint, `npm run build`, and broader TypeScript verification with increased heap.
- Remaining caveat: full `eslint`/`tsc`/`build` runs in this environment remained extremely slow and previously hit Node heap limits before producing a final clean exit, so full static verification is not yet proven locally.
