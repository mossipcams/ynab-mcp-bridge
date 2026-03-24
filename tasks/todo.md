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
## Reliability Suite Expansion Plan

### Goal

Upgrade the new reliability testing work from a small local smoke probe into a more thorough reliability suite that can:

- validate a quick smoke run locally
- establish repeatable baseline performance
- exercise higher load and short spikes
- run longer soak-style checks for degradation over time
- enforce pass/fail thresholds using latency percentiles and error-rate budgets
- emit machine-readable results for regression comparisons

### Research Notes

- Google SRE says load tests are invaluable for both reliability and capacity planning and are required for most launches because overload behavior is hard to predict from first principles.
  Source: https://sre.google/sre-book/reliable-product-launches/
- Grafana k6 recommends always creating smoke tests first, then average-load tests for baseline comparisons, and separately running stress, spike, and soak tests according to goal.
  Sources:
  https://grafana.com/docs/k6/latest/testing-guides/automated-performance-testing/
  https://grafana.com/load-testing/types-of-load-testing/
- Grafana k6 thresholds are the pass/fail criteria, should codify SLO-style goals, and can drive non-zero exits and early aborts.
  Source: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- Microsoft guidance recommends defining measurable thresholds, using percentiles such as P95 and P99 instead of averages alone, creating realistic baseline traffic, and repeating baseline validation after changes.
  Sources:
  https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/performance-targets
  https://learn.microsoft.com/en-us/azure/architecture/guide/testing/mission-critical-deployment-testing
- Microsoft load-testing guidance also calls out warmup periods, multiple concurrency levels, and realistic traffic/query mixes.
  Source: https://learn.microsoft.com/en-us/azure/databricks/vector-search/vector-search-endpoint-load-test

### Constraints And Notes

- Work is isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-reliability-script` on branch `feat/reliability-script` from `origin/main`.
- The current worktree already contains the new lightweight reliability probe implementation and its tests. The expansion should build on that work rather than replace it blindly.
- Repo rules require TDD for code changes, one task at a time, with a stop after each task.
- The existing `npm run reliability:http` command is a good smoke-level probe, but it is not sufficient for stress, spike, or soak workloads by itself.
- A homegrown Node loop is acceptable for smoke checks and local regression probes, but “test a lot” is better served by a dedicated load-testing engine and explicit thresholds.
- The safest architecture is:
  - keep the current Node-based command as a fast smoke probe
  - add a dedicated load-test suite for heavier profiles instead of trying to stretch the smoke runner into a full load generator

### Assumptions

- The best next step is to add a k6-based HTTP reliability suite alongside the existing smoke probe, not to replace the smoke probe.
- The suite should support at least these profiles:
  - `smoke`
  - `baseline`
  - `stress`
  - `spike`
  - `soak`
- The first implementation can target authless local HTTP or a provided local/staging URL.
- Thresholds should be explicit and profile-specific, including:
  - max error rate
  - p95 latency
  - p99 latency
  - optional abort-on-fail for heavier profiles
- The scenario mix should exercise at least:
  - `initialize`
  - `tools/list`
  - a lightweight tool call such as `ynab_get_mcp_version`
- The suite should emit both a concise console summary and a machine-readable artifact for regression tracking.

### Tasks

- [ ] Task 1: Add failing coverage for reliability profile definitions and threshold contracts
  Test to write:
  Add focused red tests under `src/` proving a new reliability profile module defines distinct `smoke`, `baseline`, `stress`, `spike`, and `soak` profiles with:
  explicit duration or iteration settings,
  explicit concurrency/load settings,
  and explicit pass/fail threshold targets for error rate and percentile latency.
  The tests should fail unless the profile metadata is concrete and machine-readable rather than implied by prose.
  Code to implement:
  No production code in this task. Only failing tests that pin the profile and threshold contract.
  How to verify it works:
  Run a targeted Vitest command for the new profile spec and show the failures proving the richer profile model does not exist yet.

- [ ] Task 2: Implement reliability profile and threshold configuration
  Test to write:
  Reuse the red tests from Task 1.
  Code to implement:
  Add a TypeScript module that defines the reliability profiles, threshold schema, and parsing helpers for selecting a profile from CLI inputs.
  Keep the current smoke runner compatible by mapping it to the new `smoke` profile.
  How to verify it works:
  Re-run the targeted Vitest command and show the tests turning green.

- [ ] Task 3: Add failing coverage for machine-readable summaries and regression-friendly output
  Test to write:
  Extend the reliability specs so they fail unless the suite can emit:
  per-profile summary metadata,
  attempts/successes/failures,
  p50/p95/p99 latency,
  threshold pass/fail states,
  and structured failure samples grouped by operation.
  Include assertions for a JSON artifact format suitable for CI storage and later baseline comparison.
  Code to implement:
  No production code in this task. Only failing tests for the output contract.
  How to verify it works:
  Run the targeted Vitest command and show the failures proving the richer reporting contract does not exist yet.

- [ ] Task 4: Implement structured reporting and artifact output
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Extend the current summary code so it can emit:
  human-readable console output for local runs,
  JSON result files for CI or manual diffing,
  and explicit threshold evaluation results per profile.
  Keep the local smoke path concise while making deeper results machine-readable.
  How to verify it works:
  Re-run the targeted Vitest command and show the tests passing.
  Then run the local smoke command and confirm both console and JSON outputs work.

- [ ] Task 5: Add failing coverage for a dedicated load-test suite entrypoint
  Test to write:
  Add a red spec that fails unless the repo exposes a dedicated load-test suite interface with:
  profile selection,
  target URL selection,
  optional warmup,
  and explicit exit behavior based on thresholds.
  The tests should pin the config handoff and command naming, not the internals of the external load generator.
  Code to implement:
  No production code in this task. Only failing tests that define the load-suite entrypoint contract.
  How to verify it works:
  Run the targeted Vitest command and show the failure proving the dedicated load-test suite does not exist yet.

- [ ] Task 6: Implement a dedicated heavier-weight load suite
  Test to write:
  Reuse the failing specs from Task 5.
  Code to implement:
  Add a dedicated load-testing suite using a standard engine such as k6 for the heavier `baseline`, `stress`, `spike`, and `soak` profiles.
  The suite should:
  reuse the same operation mix,
  encode thresholds as pass/fail criteria,
  support warmup where appropriate,
  and target either a started local server or a provided URL.
  Keep the existing Node command as the fast smoke test and add separate npm commands or profile flags for the heavier suite.
  How to verify it works:
  Re-run the targeted tests and show them passing.
  Then run the smoke profile and one heavier profile with intentionally small local settings as the smallest meaningful proof.

- [ ] Task 7: Add failing coverage for baseline and comparison workflows
  Test to write:
  Extend the reliability specs so they fail unless a baseline comparison flow can:
  load a prior JSON artifact,
  compare key metrics such as error rate, p95, and p99,
  and fail when regression exceeds configured tolerances.
  Code to implement:
  No production code in this task. Only failing tests for baseline comparison semantics.
  How to verify it works:
  Run the targeted Vitest command and show the failure proving regression comparison is not implemented yet.

- [ ] Task 8: Implement baseline comparison and document best-practice workflows
  Test to write:
  Reuse the failing specs from Task 7.
  Code to implement:
  Add support for comparing a new run with a stored baseline artifact and surfacing regressions clearly in console and JSON outputs.
  Document recommended usage in the README, including:
  smoke on local changes,
  baseline on a stable environment,
  stress/spike before high-risk releases,
  and soak on a scheduled cadence.
  How to verify it works:
  Re-run the targeted tests and show them passing.
  Then run typecheck and the relevant local reliability commands.

### Review Bar

- The quick smoke command remains simple and local-friendly.
- Heavier profiles use explicit, named workloads instead of ad hoc “run more requests” knobs.
- Pass/fail logic is based on error rate and percentile thresholds, not averages alone.
- The suite produces machine-readable artifacts that enable later baseline comparison.
- The docs make it clear when to use smoke, baseline, stress, spike, and soak profiles.

## Reliability Edge-Case Plan

### Goal

Add focused edge-case coverage to the new reliability suite so it is resilient around degenerate inputs, threshold boundaries, artifact compatibility, and dry-run/CLI failure handling.

### Constraints And Notes

- Work is isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-reliability-script` on branch `feat/reliability-script` from `origin/main`.
- Repo rules require TDD for code changes, one task at a time, with a stop after the plan and approval before implementation.
- The existing reliability specs cover the main happy paths and a few failing paths, but not many boundary conditions.
- The repo rules say not to modify files in a `tests/` directory unless explicitly asked to. The relevant specs live under `src/`, so targeted spec additions there are allowed.

### Assumptions

- The highest-value edge cases are:
  - zero-result summary behavior
  - threshold equality boundaries
  - repeated failure grouping and default error messages
  - invalid or partially missing artifact/baseline inputs
  - unsupported profile and missing argument handling
  - dry-run/load-suite behavior when output paths or external runner responses are unusual
- We can add these without broadening the feature set further.

### Tasks

- [ ] Task 1: Add failing coverage for runner and artifact edge cases
  Test to write:
  Extend `src/reliabilityRunner.spec.ts` and `src/reliabilityArtifact.spec.ts` with red cases that prove:
  an empty run produces zeroed metrics without throwing,
  threshold equality counts as pass rather than fail,
  repeated failures on one operation are grouped with unique sample messages,
  missing `errorMessage` values fall back to the default text,
  and baseline comparison ignores non-regressing metrics even when other metrics regress.
  Code to implement:
  No production code in this task. Only failing specs that pin the edge-case contract for summaries and artifacts.
  How to verify it works:
  Run `npx vitest run src/reliabilityRunner.spec.ts src/reliabilityArtifact.spec.ts` and show the failures proving these edge behaviors are not fully pinned yet.

- [ ] Task 2: Implement runner and artifact edge-case handling
  Test to write:
  Reuse the failing specs from Task 1.
  Code to implement:
  Tighten the summary and artifact code only where needed so the new edge cases pass without weakening any existing assertions.
  Keep the changes minimal and avoid changing the public shape unless a spec explicitly requires it.
  How to verify it works:
  Re-run `npx vitest run src/reliabilityRunner.spec.ts src/reliabilityArtifact.spec.ts` and show the tests turning green.

- [ ] Task 3: Add failing coverage for HTTP CLI and load-suite edge cases
  Test to write:
  Extend `src/reliabilityHttp.spec.ts`, `src/reliabilityProfiles.spec.ts`, and `src/reliabilityLoadSuite.spec.ts` with red cases that prove:
  unsupported profile names fail clearly,
  invalid numeric flags are rejected,
  baseline artifact reads fail with actionable errors,
  smoke JSON artifact writing behaves correctly when there are no failures,
  load-suite dry run rejects unsupported `smoke` profile usage,
  and non-zero external runner exits still preserve deterministic CLI behavior.
  Code to implement:
  No production code in this task. Only failing specs that define the CLI and entrypoint edge cases.
  How to verify it works:
  Run `npx vitest run src/reliabilityHttp.spec.ts src/reliabilityProfiles.spec.ts src/reliabilityLoadSuite.spec.ts` and show the failures proving the edge cases are not fully covered yet.

- [ ] Task 4: Implement HTTP CLI and load-suite edge-case handling
  Test to write:
  Reuse the failing specs from Task 3.
  Code to implement:
  Tighten argument parsing, baseline artifact handling, and load-suite guardrails so the red cases pass.
  Keep the smoke path concise and preserve the current command behavior unless the new spec requires a clearer error path.
  How to verify it works:
  Re-run `npx vitest run src/reliabilityHttp.spec.ts src/reliabilityProfiles.spec.ts src/reliabilityLoadSuite.spec.ts` and show the tests passing.

- [ ] Task 5: Final verification of the expanded reliability edge-case coverage
  Test to write:
  No new tests in this task. Use the approved red/green specs as proof.
  Code to implement:
  No new production behavior unless verification exposes a tightly related issue. If it does, stop and re-plan before expanding scope.
  How to verify it works:
  Run:
  `npx vitest run src/reliabilityRunner.spec.ts src/reliabilityHttp.spec.ts src/reliabilityProfiles.spec.ts src/reliabilityArtifact.spec.ts src/reliabilityLoadSuite.spec.ts`
  and
  `npm run typecheck:all`
  Then run the local smoke command plus the load-suite dry run again as the smallest meaningful end-to-end proof.

### Review Bar

- Degenerate and boundary-case inputs do not crash the reliability suite.
- CLI errors are explicit and deterministic.
- Failure grouping and artifact output remain stable under repeated or partially missing failure data.
- Baseline comparison remains strict about regressions without inventing false positives.

## K6 Runtime Compatibility Fix Plan

- [ ] Task 1: Add failing coverage for real k6 scenario compatibility
  Test to write:
  Extend `src/reliabilityLoadSuite.spec.ts` with a red assertion that fails unless the generated `ramping-vus` script excludes arrival-rate-only fields such as `preAllocatedVUs` and `maxVUs`.
  Code to implement:
  No production code in this task. Only the failing spec that captures the real runtime incompatibility exposed by `k6 v1.6.1`.
  How to verify it works:
  Run `npx vitest run src/reliabilityLoadSuite.spec.ts` and show the failure.

- [ ] Task 2: Implement the k6 scenario fix
  Test to write:
  Reuse the red spec from Task 1.
  Code to implement:
  Update `src/reliabilityLoadSuite.ts` so the generated `ramping-vus` scenario uses only fields supported by that executor while preserving the warmup and steady-state stages.
  How to verify it works:
  Re-run `npx vitest run src/reliabilityLoadSuite.spec.ts` and show it passing.

- [ ] Task 3: Re-run the real baseline load profile
  Test to write:
  No new automated tests in this task. Use the real `k6` execution as the proof.
  Code to implement:
  No new code unless the live run exposes another scoped compatibility bug. If it does, stop and re-plan before broadening the change.
  How to verify it works:
  Start the local HTTP bridge, run:
  `npm run reliability:load -- --profile baseline --url http://127.0.0.1:3000/mcp --json-out artifacts/reliability/baseline-live.json`
  and capture the pass/fail result plus the exported artifact path.

## MCP Session Reuse Plan

### Goal

Stop rebuilding the MCP server and transport on every `/mcp` request so ChatGPT can reuse a server-side session instead of showing a full reconnect-style "Connecting to app" experience for each tool call.

### Constraints And Notes

- The current HTTP path in `src/httpServer.ts` always creates a fresh `createServer(config)` plus `StreamableHTTPServerTransport` for every request and only validates `Mcp-Session-Id`; it does not reuse it.
- OAuth should remain token-based and request-authenticated. The goal is not to skip bearer verification, but to reuse the MCP transport/session after auth succeeds.
- The MCP SDK already has streamable HTTP transport support, so the cleanest change is likely to add a small session registry around the existing transport rather than inventing a parallel protocol path.
- ChatGPT and other clients may omit or vary session headers in discovery/auth flows, so the session-reuse behavior should be scoped to `/mcp` POST handling only.

### Updated Design Note

- The original plan assumed we needed to build session reuse entirely ourselves.
- During implementation prep, I verified the MCP SDK's `StreamableHTTPServerTransport` already supports stateful sessions when `sessionIdGenerator` is set.
- That means the cleaner first pass is to let the SDK issue and validate `Mcp-Session-Id` values, then add bounded lifecycle management around those managed transports on our side.

### Assumptions

- The server should switch from stateless transport creation to SDK-backed stateful sessions by providing a `sessionIdGenerator`.
- Clients like ChatGPT should then receive `Mcp-Session-Id` on initialize and reuse it on later `/mcp` requests.
- A bounded in-memory registry is still useful for idle expiry and shutdown cleanup, but it should wrap the SDK session behavior instead of replacing it.
- Malformed multi-value session headers should still be rejected, and bearer auth must still run before the MCP request is handed off.

### Tasks

- [x] Task 1: Add failing coverage for SDK-backed stateful MCP sessions
  Test to write:
  Extend `src/httpServer.spec.ts` with red cases proving that:
  initialize returns an `Mcp-Session-Id`,
  a follow-up `/mcp` request with that session id succeeds without creating a fresh transport,
  and requests with unknown session ids are rejected according to the SDK stateful transport contract.
  Code to implement:
  No production code in this task. Only the failing specs that pin the intended reuse and fallback contract.
  How to verify it works:
  Run `npx vitest run src/httpServer.spec.ts` with a focused filter or targeted assertions and show the failures proving session reuse is not implemented yet.
  Result:
  Added red coverage in `src/httpServer.spec.ts` proving initialize had no session id and unknown session ids were incorrectly accepted before implementation.
  Verified red with:
  `npx vitest run src/httpServer.spec.ts -t "issues an MCP session id on initialize and accepts follow-up requests with that session id|rejects unknown MCP session ids for non-initialize requests"`

- [x] Task 2: Implement SDK-backed stateful session reuse
  Test to write:
  Reuse the failing specs from Task 1.
  Code to implement:
  Update `src/httpServer.ts` so managed MCP requests are created in stateful mode with SDK-issued session ids and reused across later requests.
  Preserve the current invalid multi-value session-header rejection and keep the change local to the HTTP transport layer.
  How to verify it works:
  Re-run the targeted `src/httpServer.spec.ts` coverage and show the reuse tests passing.
  Result:
  Updated `src/httpServer.ts` to create stateful SDK transports for initialize requests, reuse managed sessions by `Mcp-Session-Id`, and reject unknown session ids with the SDK-compatible `404/-32001` contract while preserving one-shot stateless POST handling when no session header is present.
  Verified green with:
  `npx vitest run src/httpServer.spec.ts -t "issues an MCP session id on initialize and accepts follow-up requests with that session id|rejects unknown MCP session ids for non-initialize requests"`

- [x] Task 3: Add failing coverage for session cleanup and expiry
  Test to write:
  Extend `src/httpServer.spec.ts` with red cases proving that:
  expired idle sessions are cleaned up,
  reused sessions survive normal request completion,
  and server shutdown closes all tracked managed sessions.
  Code to implement:
  No production code in this task. Only failing specs that define cleanup expectations.
  How to verify it works:
  Run the targeted `src/httpServer.spec.ts` coverage and show the cleanup tests failing before implementation.
  Result:
  Added red tests for idle session expiry and explicit `DELETE /mcp` session termination in `src/httpServer.spec.ts`.
  Verified red with:
  `npx vitest run src/httpServer.spec.ts -t "expires idle MCP sessions and rejects follow-up requests after the timeout|terminates an issued MCP session with DELETE and rejects later requests for that session"`

- [x] Task 4: Implement cleanup, expiry, and close-all behavior
  Test to write:
  Reuse the failing specs from Task 3.
  Code to implement:
  Extend the session registry in `src/httpServer.ts` with:
  idle timeout tracking,
  eviction of expired sessions,
  and full cleanup during `startHttpServer(...).close()`.
  Use a small, testable abstraction rather than scattering timers across the request path.
  How to verify it works:
  Re-run the targeted `src/httpServer.spec.ts` cases and show them passing.
  Result:
  Added a bounded in-memory session registry with idle timers, explicit `DELETE` session termination, transport-close cleanup, and full tracked-session shutdown cleanup in `src/httpServer.ts`.
  Verified green with:
  `npx vitest run src/httpServer.spec.ts -t "expires idle MCP sessions and rejects follow-up requests after the timeout|terminates an issued MCP session with DELETE and rejects later requests for that session"`

- [x] Task 5: Add a focused ChatGPT-oriented regression test
  Test to write:
  Add a red or focused spec in `src/httpServer.spec.ts` proving that repeated authenticated ChatGPT-style `/mcp` requests can reuse the issued session id instead of staying permanently sessionless.
  Code to implement:
  Reuse the Task 2/4 implementation; only add code if the new test reveals a specific gap.
  How to verify it works:
  Run the targeted `src/httpServer.spec.ts` case and show it passing.
  Result:
  Added `reuses one issued session across repeated ChatGPT-style tool calls` in `src/httpServer.spec.ts` and updated older sessionless assumptions to the new SDK-backed session contract.
  Verified green as part of:
  `npx vitest run src/httpServer.spec.ts`

- [x] Task 6: Final verification of session reuse behavior
  Test to write:
  No new tests in this task. Use the approved red/green specs as proof.
  Code to implement:
  No new production behavior unless verification reveals a tightly related issue. If it does, stop and re-plan before broadening scope.
  How to verify it works:
  Run at minimum:
  `npx vitest run src/httpServer.spec.ts`
  and
  `npm run typecheck:all`
  Then do one small manual proof by exercising repeated `/mcp` requests and confirming session reuse in logs or instrumentation.
  Result:
  Final verification passed with:
  `npx vitest run src/httpServer.spec.ts`
  `npm run typecheck:all`
  `npm run build`
  plus a built-server manual proof that returned one issued `Mcp-Session-Id` and reused it successfully for both `tools/list` and `tools/call`, with `cleanup: false` handoff logs on both follow-up requests.

### Review Bar

- Initialize responses issue `Mcp-Session-Id` in stateful mode.
- Repeated `/mcp` requests with the same session id reuse one managed MCP session.
- Unknown or malformed session ids follow the SDK contract cleanly.
- Session cleanup is bounded and deterministic.
- OAuth and bearer verification remain request-scoped and are not bypassed.
- The implementation reduces reconnect/setup churn without introducing cross-session leakage.
