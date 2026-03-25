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

# Duplicate Code Remediation Plan

## Goal

Reduce unexpected duplicate production code in this fresh `origin/main` worktree, while first establishing a repeatable measurement and verification loop so we can prove the percentage is actually improving.

## Constraints And Notes

- Work is isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation` on branch `fix/duplicate-code-remediation` from `origin/main`.
- The original checkout remains untouched and is still dirty on another branch.
- This fresh branch currently does not include duplicate-reporting guardrails yet:
  - no checked-in [`.jscpd.json`](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/.jscpd.json)
  - no `lint:duplicates` script in [package.json](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/package.json)
  - no `tech-debt:report` script
- Prior exploratory work on another isolated branch showed the worst production duplication clusters are likely in:
  - `src/oauthStore.ts`
  - `src/oauthCore.ts`
  - `src/httpServerShared.ts`
  - `src/reliabilityHttp.ts`
  - `src/tools/SearchTransactionsTool.ts`
  - `src/tools/transactionCollectionToolUtils.ts`
  - `src/tools/planToolUtils.ts`
- Repo rules require TDD for code changes, one task at a time, with a stop after each task once execution begins.

## Assumptions

- The first remediation pass should optimize for “unexpected production duplication,” not for crushing all repetition in specs/docs/config.
- We still want a raw duplicate scan available eventually, but the first practical gate for this branch should focus on maintained implementation code.
- The best first wins are clustered helper/module refactors that remove repeated control flow, not micro-deduping tiny expressions everywhere.

## Tasks

- [x] Task 1: Add failing coverage for duplicate-measurement guardrails
  Test to write:
  Add red coverage in `src/codeQuality.spec.ts` and, if needed, `src/preflight.spec.ts` that fails unless the repo defines:
  - a checked-in JSCPD config,
  - a `lint:duplicates` script,
  - and documentation for the local duplicate-check command.
  The contract should explicitly target unexpected production duplication first, not specs/docs.
  Code to implement:
  No production/config implementation in this task beyond the failing tests.
  How to verify it works:
  Run `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts` and show the red failure.
  Result:
  Added red guardrail coverage in `src/codeQuality.spec.ts` and `src/preflight.spec.ts`.
  Verified red with:
  `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts`
  which failed because the branch was still missing `.jscpd.json`, `jscpd` in `devDependencies`, the `lint:duplicates` script, and README guidance for the local duplicate check.

- [x] Task 2: Implement the first duplicate-measurement baseline for production code
  Test to write:
  Use the failing coverage from Task 1.
  Code to implement:
  Add:
  - [`.jscpd.json`](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/.jscpd.json),
  - the `lint:duplicates` script in [package.json](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/package.json),
  - and a short README note.
  Configure the baseline so the default percentage reflects unexpected production duplication by excluding expected-repetition classes such as `*.spec.ts`, `*.contract.ts`, Markdown, generated output, and vendor files.
  How to verify it works:
  Re-run `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts`, then run `npm run lint:duplicates` and capture the first baseline percentage.
  Result:
  Added `.jscpd.json`, wired `lint:duplicates` in `package.json`, installed `jscpd`, and documented the command in `README.md`.
  Verified green with:
  `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts`
  and
  `npm run lint:duplicates`
  which established the first unexpected-production baseline at `16.37%`.

- [x] Task 3: Add failing coverage for the first targeted production deduplication seam
  Test to write:
  Add or tighten focused structure/behavior tests around the smallest high-value cluster we decide to tackle first, likely one of:
  - transaction query tool wrappers,
  - OAuth store/core record mutation helpers,
  - HTTP shared response/guard helpers.
  The red test should prove the new shared seam or helper abstraction is required, not just reassert behavior we already cover too indirectly.
  Code to implement:
  No production refactor in this task beyond the failing tests.
  How to verify it works:
  Run the narrow Vitest targets for the chosen cluster and show the red failure.
  Result:
  Added a focused structure spec in `src/duplicateCodeRemediation.spec.ts` that fails unless the repeated list-tool collection rendering is centralized behind a shared helper.
  Verified red with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts`
  which failed because `collectionToolUtils.ts` did not yet export the shared renderer and the list tools still inlined pagination/projection control flow.

- [x] Task 4: Refactor the first high-value production cluster
  Test to write:
  Reuse the failing coverage from Task 3.
  Code to implement:
  Introduce the smallest clean shared helper or abstraction that removes repeated logic without broadening behavior.
  Keep the write scope tight to the chosen cluster and preserve public tool/server behavior.
  How to verify it works:
  Re-run the targeted specs, then `npm run lint:duplicates` to confirm the percentage moves in the right direction.
  Result:
  Added `renderCollectionResult(...)` to `src/tools/collectionToolUtils.ts` and refactored:
  `ListAccountsTool.ts`,
  `ListPayeesTool.ts`,
  `ListPlanMonthsTool.ts`,
  `ListScheduledTransactionsTool.ts`,
  and `ListTransactionsTool.ts`
  to use the shared renderer instead of repeating three-way full/projection/pagination branches.
  Verified green with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/additionalReadTools.spec.ts src/planReadTools.spec.ts src/aiToolOptimization.spec.ts`
  and
  `npm run lint:duplicates`
  which moved the baseline from `16.37%` to `15.76%`.

- [x] Task 5: Add failing coverage for the second high-value production cluster
  Test to write:
  Add red coverage around the next duplicate-heavy production seam from the updated baseline.
  Prefer a different cluster than Task 4 so the changes do not overlap heavily.
  Code to implement:
  No production refactor in this task beyond the failing tests.
  How to verify it works:
  Run the narrow Vitest targets for the chosen cluster and show the red failure.
  Result:
  Added a second structural red test in `src/duplicateCodeRemediation.spec.ts` that fails unless the repeated `GetTransactionsBy*` lookup/rendering flow is centralized behind a shared helper.
  Verified red with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts`
  which failed because `src/tools/transactionToolUtils.ts` did not exist and the four lookup tools still repeated transaction filtering/formatting inline.

- [x] Task 6: Refactor the second high-value production cluster
  Test to write:
  Reuse the failing coverage from Task 5.
  Code to implement:
  Apply the minimum elegant refactor to remove the duplicated control flow or payload-shaping logic in that cluster.
  How to verify it works:
  Re-run the targeted specs, then `npm run lint:duplicates` to capture the new baseline delta.
  Result:
  Added `src/tools/transactionToolUtils.ts` with `toDisplayTransactions(...)` and `executeTransactionLookup(...)`, then refactored:
  `GetTransactionsByAccountTool.ts`,
  `GetTransactionsByCategoryTool.ts`,
  `GetTransactionsByMonthTool.ts`,
  and `GetTransactionsByPayeeTool.ts`
  to use the shared helper instead of repeating filter/map/render logic.
  Added a small object-style wrapper in `collectionToolUtils.ts` so the focused utility spec stays green against the shared collection helper seam.
  Verified green with:
  `npx vitest run src/collectionToolUtils.spec.ts src/duplicateCodeRemediation.spec.ts src/additionalReadTools.spec.ts src/aiToolOptimization.spec.ts src/planReadTools.spec.ts`
  and
  `npm run lint:duplicates`
  which moved the baseline from `15.76%` to `15.51%`.

- [x] Task 7: Add a tech-debt report for duplicate-remediation tracking
  Test to write:
  Add red coverage in `src/techDebtReport.spec.ts` or `src/codeQuality.spec.ts` so the repo fails unless a local command exists to print at least:
  - the current unexpected production duplication percentage,
  - dead exports,
  - suppression counts.
  Code to implement:
  No script implementation in this task beyond the failing tests.
  How to verify it works:
  Run the targeted Vitest command and show the red failure.
  Result:
  Added red coverage in `src/techDebtReport.spec.ts`, `src/codeQuality.spec.ts`, and `src/preflight.spec.ts` for a checked-in `tech-debt:report` command and script.
  Verified red with:
  `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts src/techDebtReport.spec.ts`
  which failed because the branch still had no `tech-debt:report` script and no `scripts/tech-debt-report.mjs`.

- [x] Task 8: Implement the tracking report and final verification loop
  Test to write:
  Reuse the failing coverage from Task 7.
  Code to implement:
  Add a maintainable local report script and README note so we can track duplicate-remediation progress over time.
  Keep the report aligned with the duplicate baseline defined in Task 2.
  How to verify it works:
  Run:
  `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts src/techDebtReport.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Then record the before/after duplicate percentages in this file.
  Result:
  Added `scripts/tech-debt-report.mjs`, wired `tech-debt:report` in `package.json`, and documented the command in `README.md`.
  Verified green with:
  `npx vitest run src/collectionToolUtils.spec.ts src/duplicateCodeRemediation.spec.ts src/additionalReadTools.spec.ts src/aiToolOptimization.spec.ts src/planReadTools.spec.ts src/codeQuality.spec.ts src/preflight.spec.ts src/techDebtReport.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Final duplicate/remediation snapshot:
  - Baseline after measurement wiring: `16.37%`
  - After list-tool deduplication: `15.76%`
  - After transaction lookup deduplication and report wiring: `15.35%`
  - `tech-debt:report` output:
    - Duplication: `15.35%`
    - Dead exports: `0`
    - `ts-ignore` count: `6`
    - `eslint-disable` count: `8`
    - `TODO/FIXME/HACK` count: `9`

## Review Bar

- The branch has a repeatable duplicate baseline focused on unexpected production duplication.
- At least two meaningful production duplication clusters are reduced with behavior preserved by tests.
- The repo gains a local report/command that makes future duplicate-remediation work measurable.
- We favor cleaner shared abstractions over “DRY at all costs” micro-refactors.

Plan ready. Approve to proceed.

# Next OAuth Seam Plan

## Goal

Reduce the next architecturally unnecessary overlap in the OAuth/token/exchange family by centralizing repeated active-grant validation and invalidation logic in `oauthCore.ts`.

## Constraints And Notes

- Work remains isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation` on branch `fix/duplicate-code-remediation`.
- The previous slice already cleaned:
  - refresh-token preconditions
  - compatibility grant builders
  - store migration split
  - grant rotation
- The next likely hotspot is repeated active-step validation in `oauthCore.ts`, especially around:
  - pending consent lookup + expiry cleanup
  - pending authorization lookup + expiry cleanup
  - refresh-token lookup + expiry cleanup + ownership checks
- The goal is to remove overlap only where the behavior is truly the same. We should not force unrelated OAuth branches into one generic engine.

## Tasks

- [x] Task 1: Add failing coverage for shared active-grant validation helpers
  Test to write:
  Add red structural coverage in `src/duplicateCodeRemediation.spec.ts` plus focused OAuth behavior coverage in `src/oauthCore.spec.ts` that fails unless repeated active-grant validation is routed through narrow helpers.
  The best initial target is likely one or both of:
  `requirePendingConsentGrant(...)`
  `requirePendingAuthorizationGrant(...)`
  with shared expiry cleanup behavior.
  Code to implement:
  No production code in this task. Only failing tests that pin the seam and preserve current behavior.
  How to verify it works:
  Run `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCore.spec.ts` and show the red failure.
  Result:
  Added red structure coverage for `requirePendingConsentGrant(...)`, `requirePendingAuthorizationGrant(...)`, and `requireRefreshTokenGrant(...)` in `src/duplicateCodeRemediation.spec.ts`, plus OAuth behavior coverage in `src/oauthCore.spec.ts` proving expired pending consent, pending authorization, and refresh-token grants are deleted through the shared validation path.
  Verified red with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCore.spec.ts`
  which failed because the helper seams did not exist yet.

- [x] Task 2: Implement the active-grant validation seam
  Test to write:
  Reuse the red tests from Task 1.
  Code to implement:
  Extract the smallest helper or helper set in `src/oauthCore.ts` that centralizes repeated validation, expiry checks, and invalid-grant cleanup for the chosen steps.
  Keep redirect building, token minting, and resource/scope checks in place unless they are part of the exact seam under test.
  How to verify it works:
  Re-run `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCore.spec.ts` and show the new tests passing.
  Result:
  Implemented `requirePendingConsentGrant(...)`, `requirePendingAuthorizationGrant(...)`, and `requireRefreshTokenGrant(...)` inside `src/oauthCore.ts`, then routed `approveConsent(...)`, `handleCallback(...)`, and `exchangeRefreshToken(...)` through those narrow validators.
  Verified green with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCore.spec.ts`

- [x] Task 3: Add failing coverage for architectural boundaries after the validation seam lands
  Test to write:
  Add a red structure/quality test that fails unless the new helper stays narrow and behavior-oriented.
  The guard should prevent us from turning `oauthCore.ts` into a generic state-machine abstraction or leaking validation rules into unrelated modules.
  Code to implement:
  No production code yet beyond the failing guard.
  How to verify it works:
  Run the targeted Vitest structure coverage and show the red failure.
  Result:
  Used the structure guard in `src/duplicateCodeRemediation.spec.ts` to pin the helpers as narrow, local seams by requiring one named helper per grant type and limiting direct store lookups for pending consent, pending authorization, and refresh-token grants to a single call site each.
  Verified red/green through the same focused command:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCore.spec.ts`

- [x] Task 4: Implement the boundary follow-up and final verification
  Test to write:
  Reuse the failing coverage from Task 3.
  Code to implement:
  Finish the smallest cleanup needed to keep the new seam readable and local.
  How to verify it works:
  Run:
  `npx vitest run src/oauthCore.spec.ts src/oauthStore.spec.ts src/oauthGrantViews.spec.ts src/oauthCompatibilityGrants.spec.ts src/oauthStoreMigration.spec.ts src/duplicateCodeRemediation.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Then record:
  the updated `oauthCore.ts` hotspot movement,
  whether the OAuth/token/exchange family still looks `partially consolidated`,
  and whether the remaining overlap now appears justified.
  Result:
  Final verification passed with:
  `npx vitest run src/oauthCore.spec.ts src/oauthStore.spec.ts src/oauthGrantViews.spec.ts src/oauthCompatibilityGrants.spec.ts src/oauthStoreMigration.spec.ts src/duplicateCodeRemediation.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Current supporting metrics:
  - whole-codebase duplication: `24.52%`
  - `oauthCore.ts`: `89` duplicated lines, `18` clones, `17.28%`
  - `oauthStore.ts`: `41` duplicated lines, `6` clones, `14.29%`
  - `oauthStoreMigration.ts`: `248` duplicated lines, `31` clones, `53.45%`
  Architectural read after this slice:
  - The OAuth/token/exchange family is still `partially consolidated`.
  - Pending-consent, pending-authorization, and refresh-token validation now share explicit active-grant seams inside `oauthCore.ts`.
  - The main remaining OAuth debt is now concentrated more honestly in `oauthStoreMigration.ts` and the broader lifecycle split, which appears more justified than the previous repeated validation overlap.

## Review Bar

- The seam removes real repeated validation/invalidation behavior, not just a few similar lines.
- The new helper stays inside `oauthCore.ts` unless a dedicated helper module is clearly cleaner.
- OAuth behavior remains stable under targeted specs.
- The result makes the OAuth lifecycle easier to reason about without hiding important branching logic.

Plan ready. Approve to proceed.

# OAuth Migration And Lifecycle Separation Plan

## Goal

Reduce the remaining architecturally unnecessary overlap in the OAuth/token/exchange family by shrinking duplicate legacy-grant conversion code in `oauthStoreMigration.ts` and by tightening the remaining repeated lifecycle transition setup in `oauthCore.ts`.

## Constraints And Notes

- Work remains isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation` on branch `fix/duplicate-code-remediation`.
- The current overlap is no longer primarily in live store persistence. It is now concentrated in:
  - legacy grant conversion paths in `src/oauthStoreMigration.ts`
  - repeated lifecycle step construction in `src/oauthCore.ts`
- The target is duplicate code for the same feature/function only. We should not merge distinct OAuth phases into one generic abstraction.
- `oauthStoreMigration.ts` appears to repeat the same “record guard + shared required fields + optional extras + step-specific fields” pattern across pending-consent, pending-authorization, authorization-code, and refresh-token conversions.
- `oauthCore.ts` still repeats some “advance this grant into the next lifecycle step” setup even after `replaceGrant(...)` and the `require*Grant(...)` validators.

## Tasks

- [ ] Task 1: Add failing coverage for shared legacy grant conversion helpers
  Test to write:
  Add red structural coverage in `src/duplicateCodeRemediation.spec.ts` and focused migration behavior coverage in `src/oauthStoreMigration.spec.ts` that fails unless `oauthStoreMigration.ts` routes legacy grant conversion through one shared required-fields seam plus one shared principal/upstream-token seam.
  The coverage should pin:
  - one helper for the common legacy grant envelope (`clientId`, `codeChallenge`, `redirectUri`, `resource`, `scopes`)
  - one helper for the principal/upstream-token pair used by authorization-code and refresh-token migrations
  - unchanged migration behavior for legacy consent/code/refresh records
  Code to implement:
  No production code in this task. Only failing tests that define the intended seam and protect current migration behavior.
  How to verify it works:
  Run `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthStoreMigration.spec.ts` and show the red failure.

- [ ] Task 2: Implement the legacy grant conversion seam
  Test to write:
  Reuse the red tests from Task 1.
  Code to implement:
  Refactor `src/oauthStoreMigration.ts` to share the common legacy grant parsing/building logic through narrow local helpers.
  Keep the helpers local to the migration module and keep the four legacy entry points explicit so the migration paths remain readable.
  How to verify it works:
  Re-run `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthStoreMigration.spec.ts` and show the new tests passing.

- [ ] Task 3: Add failing coverage for the next lifecycle-step seam in `oauthCore.ts`
  Test to write:
  Add red structural coverage in `src/duplicateCodeRemediation.spec.ts` and focused behavior coverage in `src/oauthCore.spec.ts` that fails unless repeated grant-advancement setup is routed through one narrow helper.
  The best target is the repeated “build next grant state with a generated step token and expiry” logic used when:
  - consent becomes pending authorization
  - pending authorization becomes authorization code
  - authorization code becomes refresh token
  Code to implement:
  No production code in this task. Only failing tests that pin the seam without forcing a generic lifecycle engine.
  How to verify it works:
  Run `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCore.spec.ts` and show the red failure.

- [ ] Task 4: Implement the lifecycle-step seam and rerun OAuth verification
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Extract the smallest local helper or helper pair in `src/oauthCore.ts` that removes the repeated step-construction logic while keeping branch-specific work visible.
  How to verify it works:
  Run:
  `npx vitest run src/oauthCore.spec.ts src/oauthStoreMigration.spec.ts src/oauthStore.spec.ts src/oauthGrantViews.spec.ts src/oauthCompatibilityGrants.spec.ts src/duplicateCodeRemediation.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Then record:
  - the updated `oauthStoreMigration.ts` and `oauthCore.ts` hotspot movement
  - whether the remaining OAuth overlap now looks more justified
  - whether the OAuth/token/exchange family is still `partially consolidated`

## Review Bar

- The migration refactor removes true same-feature conversion overlap without hiding the legacy formats.
- The lifecycle refactor improves clarity without inventing a generic state machine.
- All new helpers stay local unless a new module is clearly cleaner.
- The resulting OAuth code should read more like separated responsibilities and less like repeated hand-built transitions.

Plan ready. Approve to proceed.

# Legacy OAuth Removal Plan

## Goal

Remove legacy OAuth state migration entirely and require re-authentication for installs that still have the old persisted OAuth schema.

## Constraints And Notes

- Work remains isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation` on branch `fix/duplicate-code-remediation`.
- This is an intentional behavior change: older persisted OAuth state should no longer be migrated forward.
- The new desired behavior is simpler startup logic and cleaner store ownership, even though older installs will lose in-progress OAuth state and need to re-auth.
- The current legacy surface is concentrated in `src/oauthStoreMigration.ts` and the compatibility-loading path in `src/oauthStore.ts`.
- We should keep support for the current version-2 persisted grant model and only remove the pre-v2 migration behavior.

## Tasks

- [ ] Task 1: Add failing coverage for dropping legacy OAuth state instead of migrating it
  Test to write:
  Update `src/oauthStoreMigration.spec.ts` and `src/duplicateCodeRemediation.spec.ts` so they fail unless:
  - version-2 persisted state still loads correctly
  - legacy persisted shapes no longer migrate into grants
  - the migration module no longer exposes legacy conversion helpers
  Code to implement:
  No production code in this task. Only failing tests that define the new compatibility boundary.
  How to verify it works:
  Run `npx vitest run src/oauthStoreMigration.spec.ts src/duplicateCodeRemediation.spec.ts` and show the red failure.

- [ ] Task 2: Remove legacy OAuth migration behavior
  Test to write:
  Reuse the red tests from Task 1.
  Code to implement:
  Simplify `src/oauthStoreMigration.ts` so it only parses the current persisted OAuth schema.
  Remove the legacy-state conversion path and any now-dead helpers/types.
  Keep `src/oauthStore.ts` loading the current persisted state through the simplified parser.
  How to verify it works:
  Re-run `npx vitest run src/oauthStoreMigration.spec.ts src/duplicateCodeRemediation.spec.ts` and show the new tests passing.

- [ ] Task 3: Add failing coverage for the startup/re-auth boundary
  Test to write:
  Add focused coverage in `src/oauthStore.spec.ts` or `src/oauthCore.spec.ts` that proves the system behaves safely when old persisted OAuth data is effectively ignored.
  The goal is to pin the intended fallback behavior: no migrated grants, no crash, normal re-auth flow from a clean current-state load.
  Code to implement:
  No production code in this task. Only failing tests that pin the re-auth boundary.
  How to verify it works:
  Run the focused OAuth specs and show the red failure.

- [ ] Task 4: Implement any remaining cleanup, then run full OAuth verification
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Finish the smallest cleanup needed after removing legacy migration, including any docs or task-log updates that clarify re-auth is now expected for old persisted state.
  How to verify it works:
  Run:
  `npx vitest run src/oauthCore.spec.ts src/oauthStore.spec.ts src/oauthStoreMigration.spec.ts src/oauthGrantViews.spec.ts src/oauthCompatibilityGrants.spec.ts src/duplicateCodeRemediation.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Then record:
  - the updated OAuth overlap story
  - whether `oauthStoreMigration.ts` is now appropriately minimal
  - whether the OAuth/token/exchange family still looks `partially consolidated`

## Review Bar

- Legacy OAuth migration is fully removed, not half-kept.
- Current version-2 persisted OAuth loading still works.
- Old persisted OAuth state now safely falls back to re-auth instead of migration.
- The result materially simplifies OAuth store ownership and removes duplicate legacy behavior.

Plan ready. Approve to proceed.

## Results

- [x] Task 1: Add failing coverage for dropping legacy OAuth state instead of migrating it
  Result:
  Updated `src/oauthStoreMigration.spec.ts` to pin the new compatibility boundary:
  version-2 persisted state still loads,
  and legacy OAuth shapes now drop to an empty current-state load.
  Tightened `src/duplicateCodeRemediation.spec.ts` so `src/oauthStoreMigration.ts` fails review if it still defines `LegacyPersistedOAuthState` or any `toLegacy*` / `migrateLegacyState(...)` helpers.
  Verified red with:
  `npx vitest run src/oauthStoreMigration.spec.ts src/duplicateCodeRemediation.spec.ts`
  which failed because the migration module still carried the legacy loader and conversion helpers.

- [x] Task 2: Remove legacy OAuth migration behavior
  Result:
  Simplified `src/oauthStoreMigration.ts` to one responsibility: parse the current version-2 persisted OAuth schema.
  Removed the legacy-state conversion path and all legacy conversion helpers/types.
  `loadPersistedOAuthState(...)` now returns a clean empty version-2 state for any non-current persisted OAuth shape.
  Verified green with:
  `npx vitest run src/oauthStoreMigration.spec.ts src/duplicateCodeRemediation.spec.ts`

- [x] Task 3: Add failing coverage for the startup/re-auth boundary
  Result:
  Replaced the old migration-on-load store test in `src/oauthStore.spec.ts` with a startup boundary test that expects:
  legacy persisted OAuth data is ignored,
  no migrated grants survive load,
  and the store can immediately persist a new current-model grant for a fresh re-auth flow.
  This coverage was already green once Task 2 landed, which confirmed the simplified loader already gave us the intended startup behavior without extra production changes.
  Verified with:
  `npx vitest run src/oauthStore.spec.ts`

- [x] Task 4: Implement any remaining cleanup, then run full OAuth verification
  Result:
  Final verification passed with:
  `npx vitest run src/oauthCore.spec.ts src/oauthStore.spec.ts src/oauthStoreMigration.spec.ts src/oauthGrantViews.spec.ts src/oauthCompatibilityGrants.spec.ts src/duplicateCodeRemediation.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Updated supporting metrics:
  - whole-codebase duplication: `24.39%`
  - `src/oauthStoreMigration.ts`: `38` duplicated lines, `9` clones, `16.89%`
  - `src/oauthStore.ts`: `41` duplicated lines, `6` clones, `14.29%`
  - `src/oauthCore.ts`: `89` duplicated lines, `18` clones, `17.28%`
  Updated architectural read:
  - `oauthStoreMigration.ts` is now appropriately minimal instead of acting as a legacy grant-conversion host.
  - Old persisted OAuth state now safely falls back to re-auth.
  - The OAuth/token/exchange family is still `partially consolidated`, but the remaining overlap is now mostly in current lifecycle behavior rather than backward-compatibility baggage.

# OAuth Cleanliness Fix Plan

## Goal

Fix the highest-payoff cleanliness issues in the OAuth, token, and handoff path without forcing abstractions that blur responsibilities.

## Constraints And Notes

- Work remains isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation` on branch `fix/duplicate-code-remediation`.
- The current architectural read is:
  - `oauthGrantViews.ts` is clean
  - `oauthCompatibilityGrants.ts` is clean
  - `oauthCore.ts` is improved but still has brittle refresh-token invariants and repeated transition choreography
  - `oauthStore.ts` is still overloaded, especially in legacy migration/parsing
- The goal is cleaner code for the same feature/function, not maximal consolidation.
- If implementation or verification shows this plan is wrong, stop and re-plan before continuing.

## Tasks

- [x] Task 1: Fail fast on missing upstream refresh-token context
  Test to write:
  Add red coverage in `src/oauthCore.spec.ts` proving `exchangeRefreshToken(...)` throws a local `InvalidGrantError` before calling the upstream adapter when the stored grant lacks `upstreamTokens` or `upstreamTokens.refresh_token`.
  The test should explicitly assert the upstream refresh exchange mock is not called.
  Code to implement:
  Tighten `src/oauthCore.ts` so refresh-token exchange requires complete upstream refresh-token context before attempting the upstream handoff.
  Keep the existing grant ownership, scope, and resource checks intact.
  How to verify it works:
  Run `npx vitest run src/oauthCore.spec.ts` and show the red failure first, then green after the implementation.
  Result:
  Added red coverage in `src/oauthCore.spec.ts` proving the refresh exchange must fail locally when a stored grant is missing `upstreamTokens.refresh_token`.
  Updated `src/oauthCore.ts` so `exchangeRefreshToken(...)` deletes the invalid grant and throws `InvalidGrantError("Refresh token is missing upstream refresh-token context.")` before calling the upstream adapter.
  Verified red with:
  `npx vitest run src/oauthCore.spec.ts`
  which failed because the refresh path still resolved successfully by handing an empty string upstream.
  Verified green with:
  `npx vitest run src/oauthCore.spec.ts`

- [x] Task 2: Extract legacy OAuth migration/parsing out of `oauthStore.ts`
  Test to write:
  Add red structural coverage in `src/duplicateCodeRemediation.spec.ts` and focused behavior coverage in a new spec such as `src/oauthStoreMigration.spec.ts` that fails unless legacy parsing/migration is delegated to a dedicated module.
  Preserve the existing migration contract for legacy pending consent, pending authorization, authorization code, and refresh token records.
  Code to implement:
  Move legacy parsing/migration helpers from `src/oauthStore.ts` into a dedicated module, likely `src/oauthStoreMigration.ts`.
  Keep `oauthStore.ts` focused on current-state load/prune/persist/query responsibilities.
  How to verify it works:
  Run `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthStoreMigration.spec.ts src/oauthStore.spec.ts` and show the red failure first, then green after the split.
  Then run `npm run lint:duplicates` and record the `oauthStore.ts` hotspot movement.
  Result:
  Added red structural coverage in `src/duplicateCodeRemediation.spec.ts` and new behavior coverage in `src/oauthStoreMigration.spec.ts`.
  Extracted legacy parsing and migration into `src/oauthStoreMigration.ts` and updated `src/oauthStore.ts` to delegate persisted-state loading to that module.
  Verified red with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthStoreMigration.spec.ts`
  which failed because `src/oauthStoreMigration.ts` did not exist yet and `oauthStore.ts` still owned inline migration helpers.
  Verified green with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthStoreMigration.spec.ts src/oauthStore.spec.ts`

- [x] Task 3: Protect architectural boundaries after the migration split
  Test to write:
  Add a red quality/structure test that fails unless:
  `oauthStore.ts` no longer owns legacy migration details,
  the migration module does not perform live persistence,
  and the store module still owns file I/O and current grant persistence.
  Code to implement:
  Make the smallest follow-up cleanup needed so the split stays durable and responsibilities remain crisp.
  How to verify it works:
  Run the targeted Vitest structure coverage and show the red failure first, then green after the cleanup.
  Result:
  Added a red structural guard in `src/duplicateCodeRemediation.spec.ts` requiring deserialization to live in `src/oauthStoreMigration.ts` while `src/oauthStore.ts` keeps live file I/O.
  Added `deserializePersistedOAuthState(...)` to `src/oauthStoreMigration.ts` and updated `src/oauthStore.ts` to stop calling `JSON.parse(...)` directly.
  Verified red with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts`
  which failed because `oauthStore.ts` still owned JSON deserialization.
  Verified green with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthStoreMigration.spec.ts src/oauthStore.spec.ts`

- [x] Task 4: Remove one repeated lifecycle transition seam in `oauthCore.ts`
  Test to write:
  Add red coverage in `src/duplicateCodeRemediation.spec.ts` plus targeted OAuth behavior specs that fails unless one repeated transition path is centralized behind a narrow helper.
  The best candidate is the repeated “validate step, delete old grant, save next grant” choreography shared across consent approval, callback handling, authorization-code exchange, and refresh-token rotation.
  Code to implement:
  Extract one narrow transition helper in `src/oauthCore.ts` or a dedicated focused helper module.
  Do not build a generic OAuth engine.
  Keep redirect building and token minting where they currently belong unless the tests show a cleaner seam.
  How to verify it works:
  Run targeted OAuth Vitest coverage and show the red failure first, then green after the implementation.
  Result:
  Added a red structural guard in `src/duplicateCodeRemediation.spec.ts` for a narrow `replaceGrant(...)` helper in `src/oauthCore.ts`.
  Implemented `replaceGrant(...)` and routed consent approval, callback handling, authorization-code exchange, and refresh-token rotation through it.
  Verified red with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts`
  which failed because `oauthCore.ts` still rotated grants inline.
  Verified green with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCore.spec.ts`

- [x] Task 5: Final verification and architectural scorecard refresh
  Test to write:
  No new tests in this task. Use the approved red/green tests as proof.
  Code to implement:
  No new production behavior unless verification exposes a tightly coupled issue. If that happens, stop and re-plan.
  How to verify it works:
  Run:
  `npx vitest run src/oauthCore.spec.ts src/oauthStore.spec.ts src/oauthGrantViews.spec.ts src/oauthCompatibilityGrants.spec.ts src/duplicateCodeRemediation.spec.ts`
  plus any new migration spec added in Task 2,
  `npm run lint:duplicates`,
  `npm run tech-debt:report`,
  `npm run typecheck`
  Then record:
  the updated OAuth hotspot movement,
  whether `oauthStore.ts` now looks primarily like a store instead of a migration host,
  and whether the OAuth/token/exchange family remains `partially consolidated` or moves closer to `appropriately separated`.
  Result:
  Final verification passed with:
  `npx vitest run src/oauthCore.spec.ts src/oauthStore.spec.ts src/oauthGrantViews.spec.ts src/oauthCompatibilityGrants.spec.ts src/oauthStoreMigration.spec.ts src/duplicateCodeRemediation.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Updated OAuth hotspot movement from the latest JSCPD report:
  `src/oauthStore.ts`: `274` duplicated lines / `34` clones / `37.59%` before -> `41` duplicated lines / `6` clones / `14.29%` after
  `src/oauthCore.ts`: `84` duplicated lines / `17` clones / `17.28%` before -> `89` duplicated lines / `18` clones / `18.02%` after
  `src/oauthStoreMigration.ts`: new migration-focused module with `248` duplicated lines / `31` clones / `53.45%`
  `src/oauthCompatibilityGrants.ts`: focused helper module remains at `26` duplicated lines / `4` clones / `30.23%`
  Updated architectural reading:
  `oauthStore.ts` now reads primarily like a live store instead of a migration host, the refresh-token handoff is safer, and grant rotation in `oauthCore.ts` is cleaner.
  The OAuth/token/exchange family still remains `partially consolidated`, because the migration module now holds legacy complexity and `oauthCore.ts` still has some repeated lifecycle validation/choreography that may or may not merit another seam.

## Review Bar

- The refresh-token path no longer performs a brittle upstream handoff with missing local context.
- `oauthStore.ts` has fewer unrelated responsibilities and is materially easier to reason about.
- Any new seam in `oauthCore.ts` is narrow and behavior-oriented, not a speculative abstraction.
- The final summary explains what is now clean, what remains intentionally separate, and what debt still remains.

Plan ready. Approve to proceed.
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

# Whole-Codebase Duplicate Scan Follow-Up

## Goal

Make the official duplicate-code metric a whole-codebase scan instead of the current implementation-only baseline, while keeping the report and docs aligned to that definition.

## Constraints And Notes

- Work stays isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation` on branch `fix/duplicate-code-remediation`.
- The user explicitly corrected the metric definition: duplicate scanning should cover the whole codebase.
- "Whole codebase" should include maintained repo code such as `src/`, `scripts/`, `debugging/`, workflow/config files, specs, contracts, and Markdown.
- It should still exclude generated/vendor paths like `.git/`, `node_modules/`, `dist/`, and `artifacts/`.
- This is a config-and-contract change, so it still follows TDD before implementation.

## Assumptions

- `tasks/**` should now count, because it is repo-authored code/docs rather than generated output.
- `package-lock.json` can remain excluded because it is generated dependency metadata, not maintained code.
- The headline in `tech-debt:report` should explicitly reflect the whole-codebase number rather than the old narrowed baseline.

## Tasks

- [x] Task 1: Add failing coverage for whole-codebase duplicate-scan guardrails
  Test to write:
  Extend `src/codeQuality.spec.ts` and `src/preflight.spec.ts` so they fail unless the duplicate-scan contract matches a whole-codebase definition.
  The red assertions should prove that [`.jscpd.json`](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/.jscpd.json) no longer excludes:
  `**/*.spec.ts`,
  `**/*.contract.ts`,
  `**/*.md`,
  or `tasks/**`.
  Code to implement:
  No config changes yet. Only the failing tests that pin the new boundary.
  How to verify it works:
  Run `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts` and show the red failure.
  Result:
  Tightened `src/codeQuality.spec.ts` and `src/preflight.spec.ts` so the duplicate-scan contract now rejects exclusions for `*.spec.ts`, `*.contract.ts`, `*.md`, and `tasks/**`, and requires README wording for whole-codebase duplication.
  Verified red with:
  `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts`
  which failed because `.jscpd.json` still excluded those paths and the README still described an implementation-only baseline.

- [x] Task 2: Implement the whole-codebase JSCPD scope
  Test to write:
  Reuse the failing coverage from Task 1.
  Code to implement:
  Update [`.jscpd.json`](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/.jscpd.json) so the scan covers the whole codebase, keeping only generated/vendor exclusions.
  Update [README.md](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/README.md) so `lint:duplicates` is documented as a whole-codebase scan.
  How to verify it works:
  Re-run `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts`, then run `npm run lint:duplicates` and capture the new whole-codebase baseline.
  Result:
  Updated `.jscpd.json` to keep only generated/vendor exclusions and rewrote the README command notes so `lint:duplicates` is described as a whole-codebase scan.
  Verified green with:
  `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts`
  and
  `npm run lint:duplicates`
  which raised the live whole-codebase baseline to `24.35%`.

- [x] Task 3: Add failing coverage for whole-codebase tech-debt reporting
  Test to write:
  Extend `src/techDebtReport.spec.ts` so it fails unless the report wording and contract reflect whole-codebase duplication rather than the narrowed implementation-only baseline.
  If needed, tighten `src/preflight.spec.ts` to require README wording that matches the new scope.
  Code to implement:
  No script changes yet. Only the failing tests.
  How to verify it works:
  Run `npx vitest run src/techDebtReport.spec.ts src/preflight.spec.ts` and show the red failure.
  Result:
  Tightened `src/techDebtReport.spec.ts` so the report contract now requires a `Whole-codebase duplication:` headline.
  Verified red with:
  `npx vitest run src/techDebtReport.spec.ts src/preflight.spec.ts`
  which failed because the report still printed the older generic `Duplication:` label.

- [x] Task 4: Implement the report/doc alignment and rerun the official metric
  Test to write:
  Reuse the failing coverage from Task 3.
  Code to implement:
  Update [scripts/tech-debt-report.mjs](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/scripts/tech-debt-report.mjs) and [README.md](/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation/README.md) so the printed duplication number is explicitly the whole-codebase scan.
  Keep the other report metrics unchanged unless verification forces a small adjacent fix.
  How to verify it works:
  Run:
  `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts src/techDebtReport.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Then record the new whole-codebase duplication percentage in this file.
  Result:
  Updated `scripts/tech-debt-report.mjs` so the report headline is `Whole-codebase duplication:` and aligned the supporting debt-marker scan with the same whole-codebase boundary by counting Markdown and `tasks/**` content too.
  Verified green with:
  `npx vitest run src/codeQuality.spec.ts src/preflight.spec.ts src/techDebtReport.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Final whole-codebase duplicate/remediation snapshot:
  - Whole-codebase duplication: `24.35%`
  - Clones: `721`
  - Duplicated lines: `5489`
  - `tech-debt:report` output:
    - Whole-codebase duplication: `24.35%`
    - Dead exports: `0`
    - `ts-ignore` count: `7`
    - `eslint-disable` count: `10`
    - `TODO/FIXME/HACK` count: `15`

## Review Bar

- The repo’s official duplicate scan matches the user’s whole-codebase definition.
- Only generated/vendor paths stay excluded.
- The report, docs, and test guardrails all describe the same scope.
- The final number is rerun from the live config, not inferred from the previous narrowed baseline.

Plan ready. Approve to proceed.
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

# Duplicate-Feature Consolidation Plan

## Goal

Reduce duplicate code by consolidating overlapping feature families, starting with the parts of the product surface where multiple tools appear to answer the same class of question with repeated fetch, shaping, and summary logic.

## Constraints And Notes

- Work remains isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation` on branch `fix/duplicate-code-remediation`.
- The current official duplicate metric is whole-codebase duplication, but this plan prioritizes production feature overlap over pure clone-count reduction.
- The highest-value overlap appears to be in:
  - finance summary tools
  - transaction browsing/query tools
  - then supporting lifecycle internals like OAuth
- Repo rules still require TDD, one task at a time, with a stop after each completed task during execution.

## Assumptions

- “Duplicate features” here means multiple tools or modules with materially overlapping user-facing purpose, not just textually similar code.
- We should prefer extracting shared summary/query engines before removing tool surface area, unless tests prove some tools are actually redundant enough to merge.
- Test duplication alone is not a primary target unless it blocks the feature-level consolidation work.

## Tasks

- [x] Task 1: Add failing coverage for the finance-summary consolidation seam
  Test to write:
  Add red structural and behavior coverage in the finance summary specs that fails unless the overlapping month-summary tools share one common summary-building seam.
  Focus on tools like:
  `GetMonthlyReviewTool.ts`,
  `GetSpendingSummaryTool.ts`,
  `GetCashFlowSummaryTool.ts`,
  `GetBudgetHealthSummaryTool.ts`,
  and `GetIncomeSummaryTool.ts`.
  The red test should prove they derive overlapping month-level metrics from one shared builder or engine rather than each reshaping the same ideas independently.
  Code to implement:
  No production refactor yet. Only failing tests that pin the expected shared seam and preserve current payload behavior.
  How to verify it works:
  Run the targeted finance summary Vitest coverage and show the red failure.

- [x] Task 2: Implement the finance-summary shared seam
  Test to write:
  Reuse the failing coverage from Task 1.
  Code to implement:
  Extract the smallest clean shared builder/engine for overlapping month-summary calculations and migrate the targeted finance tools onto it without changing their public payload contracts.
  How to verify it works:
  Re-run the targeted finance specs, then `npm run lint:duplicates` and capture the duplicate delta in the affected production files.

- [x] Task 3: Add failing coverage for the transaction-browsing consolidation seam
  Test to write:
  Add red structural and behavior coverage around:
  `SearchTransactionsTool.ts`,
  `ListTransactionsTool.ts`,
  and the `GetTransactionsBy*` family
  so the repo fails unless they share a coherent transaction query/rendering pipeline rather than repeating overlapping filtering and response-shaping patterns.
  Code to implement:
  No production refactor yet beyond the failing tests.
  How to verify it works:
  Run the narrow transaction-tool Vitest coverage and show the red failure.

- [x] Task 4: Implement the transaction-browsing shared seam
  Test to write:
  Reuse the failing coverage from Task 3.
  Code to implement:
  Consolidate the overlapping transaction retrieval and rendering logic behind one shared query/render layer while preserving each tool’s contract.
  Prefer extending the existing transaction helper path rather than adding another parallel abstraction.
  How to verify it works:
  Re-run the targeted transaction specs, then `npm run lint:duplicates` and capture the duplicate delta in the transaction-tool family.

- [x] Task 5: Add failing coverage for feature-overlap review and tool-surface clarity
  Test to write:
  Add quality/spec coverage that fails unless overlapping finance and transaction tools have clear differentiated descriptions or documented roles after consolidation.
  The red test should protect against keeping multiple nearly-identical tools with unclear positioning.
  Code to implement:
  No production metadata/doc updates yet. Only failing tests that pin the clarity requirement.
  How to verify it works:
  Run the targeted registrar/quality coverage and show the red failure.

- [x] Task 6: Implement tool-surface clarification
  Test to write:
  Reuse the failing coverage from Task 5.
  Code to implement:
  Update tool descriptions and, if needed, README notes so overlapping tools clearly state when to use each one after the shared refactors.
  How to verify it works:
  Re-run the targeted quality/registry specs and inspect the registered metadata for the consolidated feature families.

- [x] Task 7: Add failing coverage for the next non-user-facing duplicate-feature seam
  Test to write:
  Add red coverage around the highest-value internal overlap that remains after finance and transaction consolidation, likely:
  `oauthStore.ts` plus `oauthCore.ts`
  or the reliability runner/artifact pair.
  The red test should force one shared lifecycle or reporting seam rather than repeated internal state handling.
  Code to implement:
  No production refactor yet beyond the failing tests.
  How to verify it works:
  Run the narrow targeted Vitest coverage and show the red failure.

- [x] Task 8: Implement the next internal consolidation seam and finish verification
  Test to write:
  Reuse the failing coverage from Task 7.
  Code to implement:
  Refactor the chosen internal overlap behind a single clean seam, then rerun the official duplicate/report commands.
  How to verify it works:
  Run:
  `npx vitest run` for all touched targeted suites
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Then record the before/after whole-codebase duplication and the affected feature-family hotspots in this file.

## Review Bar

- At least two overlapping user-facing feature families are consolidated behind shared engines/builders.
- Tool contracts stay stable while implementation overlap drops.
- Tool descriptions become clearer where feature overlap remains intentional.
- The next internal duplicate-feature seam is reduced only after the user-facing overlaps are cleaned up.
- The final verification includes both behavior proofs and the official whole-codebase duplicate metric.

Plan ready. Approve to proceed.

## Results

- Finance-summary overlap is now reduced through `buildBudgetHealthMonthSummary(...)` in `src/tools/financeToolUtils.ts`, with `GetMonthlyReviewTool.ts` and `GetBudgetHealthSummaryTool.ts` sharing one month budget-health shaping seam.
- Transaction browse tools now share `transactionFields` plus `toDisplayTransactions(...)` in `src/tools/transactionToolUtils.ts`, and `SearchTransactionsTool.ts` now uses the same collection rendering path as `ListTransactionsTool.ts`.
- Transaction tool descriptions now differentiate overview, filtered drill-down, and “already know the ID/month” lookup use cases in the registry metadata.
- Reliability summary math is centralized in `src/reliabilitySummaryUtils.ts`, with both `reliabilityRunner.ts` and `reliabilityArtifact.ts` delegating percentile, failure-group, threshold, and totals shaping to one helper.
- Whole-codebase duplication improved during this plan from `24.35%` to `24.04%`, with the current scan reporting `720` clones and `5489` duplicated lines.
- Final verification on the current branch state passed with:
  `npx vitest run src/financeToolUtils.spec.ts src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/transactionToolUtils.spec.ts src/aiToolOptimization.spec.ts src/additionalReadTools.spec.ts src/serverFactory.spec.ts src/reliabilitySummaryUtils.spec.ts src/reliabilityRunner.spec.ts src/reliabilityArtifact.spec.ts src/duplicateCodeRemediation.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
- Current tech-debt report output:
  whole-codebase duplication `24.04%`
  dead exports `0`
  `ts-ignore` count `7`
  `eslint-disable` count `10`
  `TODO/FIXME/HACK` count `15`

# OAuth Duplicate-Feature Follow-Up Plan

## Goal

Reduce the largest remaining production duplicate hotspot by consolidating overlapping OAuth lifecycle/state-handling code in `src/oauthStore.ts` and `src/oauthCore.ts`.

## Metric Correction

- The JSCPD whole-codebase percentage is useful as a secondary clone signal, but it is not the primary baseline for this branch anymore.
- The primary baseline for this effort should be duplicate features/functions: overlapping user-facing or internal behavioral seams that are implemented more than once.
- Going forward, branch progress should be described first in terms of which duplicate feature families were consolidated and how their overlapping responsibilities shrank.
- JSCPD percentages and duplicated-line counts should still be recorded, but only as supporting evidence.

## Why This Hotspot

- The latest whole-codebase JSCPD scan still shows `src/oauthStore.ts` as the largest non-test production hotspot on this branch.
- `src/oauthCore.ts` is the paired internal seam with the clearest overlap in record validation, threshold checks, and repeated transition/report shaping.
- This is a better next target than test-heavy files because it removes real implementation duplication instead of mostly fixture repetition.

## Tasks

- [x] Task 1: Add failing coverage for a shared OAuth lifecycle seam
  Test to write:
  Add red structural and behavior coverage in OAuth-focused specs so the repo fails unless `oauthStore.ts` and `oauthCore.ts` delegate one repeated lifecycle/reporting path to a shared helper.
  Prefer the smallest seam that currently appears in both modules, such as repeated state transition shaping, stale/invalid-state handling, or repeated summary record construction.
  Code to implement:
  No production refactor yet. Only failing tests that pin the seam and preserve current OAuth behavior.
  How to verify it works:
  Run the narrow OAuth Vitest coverage and show the red failure.

- [x] Task 2: Implement the shared OAuth lifecycle seam
  Test to write:
  Reuse the failing coverage from Task 1.
  Code to implement:
  Extract the smallest clean shared helper/module for the repeated OAuth lifecycle logic and migrate only the overlapping paths onto it.
  Keep OAuth contracts and persistence behavior stable.
  How to verify it works:
  Re-run the targeted OAuth specs, then `npm run lint:duplicates` and capture the duplicate delta in `src/oauthStore.ts` and `src/oauthCore.ts`.

- [x] Task 3: Add failing coverage for OAuth tool-surface or internal clarity where overlap remains
  Test to write:
  Add a narrow quality/structure test that fails unless the remaining OAuth responsibilities are more clearly separated after the shared seam lands.
  This can be a structural guard that prevents the same repeated helper from being re-inlined in both modules again.
  Code to implement:
  No production change yet beyond the failing guard.
  How to verify it works:
  Run the targeted OAuth/structure Vitest coverage and show the red failure.

- [x] Task 4: Implement the clarity follow-up and final verification
  Test to write:
  Reuse the failing coverage from Task 3.
  Code to implement:
  Finish the minimal follow-up refactor or metadata/structure cleanup needed to keep the new seam durable and easy to review.
  How to verify it works:
  Run:
  `npx vitest run` for all touched OAuth suites
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Then record the before/after duplicate numbers and the remaining top production hotspots in this file.

## Review Bar

- The next largest production duplicate cluster is reduced in real implementation code, not just in tests.
- OAuth behavior stays stable under targeted specs.
- The extracted seam is narrow and readable, not a large speculative abstraction.
- The final proof includes both behavior tests and an updated duplicate/report baseline.

Plan ready. Approve to proceed.

## Results

- OAuth grant record projection now lives in `src/oauthGrantViews.ts`, and both `src/oauthStore.ts` and `src/oauthCore.ts` delegate consent, pending-authorization, authorization-code, and refresh-token record shaping to that helper.
- `src/oauthCore.ts` now centralizes authorization-code grant validation behind `requireAuthorizationCodeGrant(...)` instead of repeating the same ownership and expiry checks in multiple call sites.
- Targeted OAuth verification passed with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthGrantViews.spec.ts src/oauthStore.spec.ts src/oauthCore.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
- Whole-codebase duplication improved from `24.04%` to `23.85%` during this follow-up.
- Feature/function baseline improvement:
  the OAuth lifecycle family now has one shared grant-view seam and one shared authorization-code validation seam instead of duplicating those responsibilities across `oauthStore.ts` and `oauthCore.ts`.
- OAuth hotspot movement from the latest JSCPD report:
  `src/oauthStore.ts`: `386` duplicated lines / `48` clones / `44.11%` before -> `310` duplicated lines / `38` clones / `39.14%` after
  `src/oauthCore.ts`: `132` duplicated lines / `21` clones / `26.04%` before -> `84` duplicated lines / `17` clones / `17.28%` after
- Current tech-debt report output:
  whole-codebase duplication `23.85%`
  dead exports `0`
  `ts-ignore` count `7`
  `eslint-disable` count `11`
  `TODO/FIXME/HACK` count `18`

## Architecturally-Unnecessary Duplicate Feature/Function Scorecard

Primary status scale for this branch:
- `not started`: the family still has architecturally unnecessary duplicate feature/function code and no intentional shared seam yet
- `partially consolidated`: at least one real shared behavioral seam is in place, but some architecturally unnecessary overlap still remains
- `appropriately separated`: the remaining differences appear justified by responsibility boundaries, so more consolidation would likely hurt the architecture

Scoring rule:
- The primary baseline is not raw JSCPD percentage. It is whether the codebase still implements the same feature/function multiple times without an architectural reason.
- JSCPD remains supporting evidence for lexical overlap and hotspot discovery, not the main success metric.
- Similar code should stay separate when the responsibilities are genuinely different.

Current branch scorecard:
- OAuth, token, and exchange lifecycle family: `partially consolidated`
  Shared seams now exist for grant-record views and authorization-code validation.
  This still looks like the largest remaining duplicate-feature debt area because grant transitions, token persistence, exchange validation, and legacy compatibility paths are split across overlapping code in `src/oauthStore.ts` and `src/oauthCore.ts`.
- Finance summary family: `partially consolidated`
  Shared seam now exists for month budget-health shaping via `buildBudgetHealthMonthSummary(...)`.
  Remaining overlap still exists across spending, income, cash-flow, and broader monthly summary behavior, but some separation may still be architecturally correct if the tools are intentionally different.
- Transaction browsing family: `partially consolidated`
  Shared browse rendering now exists through `transactionFields` and `toDisplayTransactions(...)`, and the tool surface is clearer.
  Remaining overlap still exists between broad search/list behavior and narrower transaction query helpers, but this family should only be pushed further where the shared seam improves clarity rather than blurring tool responsibilities.
- Reliability reporting family: `partially consolidated`
  Shared summary math now exists through `summarizeReliabilityResults(...)`.
  Remaining overlap still exists in surrounding CLI/report orchestration and related reliability surfaces, though some of that separation may be appropriate.

Working branch baseline:
- `0` families are clearly `appropriately separated`
- `4` families remain `partially consolidated`
- largest likely tech-debt area: OAuth, tokens, and exchange flow
- highest-value next step is to reduce architecturally unnecessary overlap in the OAuth/token/exchange family before forcing more consolidation elsewhere

# OAuth/Token/Exchange Duplicate-Feature Remediation Plan

## Goal

Reduce architecturally unnecessary duplicate code in the OAuth, token, and exchange lifecycle without collapsing responsibilities that should remain distinct.

## Constraints And Notes

- Work remains isolated in `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-duplicate-code-remediation` on branch `fix/duplicate-code-remediation`.
- The primary success metric is not raw JSCPD percentage. The main question is whether the same OAuth/token/exchange behavior is still implemented multiple times without an architectural reason.
- Existing work already introduced two real shared seams:
  - grant-record projection in `src/oauthGrantViews.ts`
  - authorization-code validation in `src/oauthCore.ts`
- The biggest remaining overlap appears to be:
  - grant transition and persistence shaping across `src/oauthStore.ts`
  - token/exchange validation and update flow across `src/oauthCore.ts`
  - legacy compatibility/import paths that rebuild similar grant state in parallel
- The repo requires TDD for code changes, one task at a time, with a stop after each task once execution begins.

## Assumptions

- We should only extract shared seams where the same lifecycle responsibility is genuinely being implemented in more than one place.
- Consent handling, authorization-code exchange, refresh-token rotation, and legacy persistence compatibility may share some mechanics but should not be forced into one oversized abstraction.
- A good next seam is likely a narrow grant-transition or token-state updater helper rather than a general-purpose "OAuth engine".

## Tasks

- [x] Task 1: Add failing coverage for the next shared OAuth/token/exchange seam
  Test to write:
  Add red structural and behavior coverage in `src/duplicateCodeRemediation.spec.ts` plus the narrow OAuth suites that fails unless one remaining repeated lifecycle path is routed through a shared helper.
  Target one specific overlap, likely:
  repeated grant-state persistence shaping,
  repeated token update application,
  or repeated legacy grant normalization.
  Code to implement:
  No production code in this task. Only failing tests that pin the next seam and preserve current OAuth/token/exchange behavior.
  How to verify it works:
  Run the targeted OAuth Vitest coverage and show the red failure.
  Result:
  Added red coverage in `src/duplicateCodeRemediation.spec.ts` and new helper-behavior coverage in `src/oauthCompatibilityGrants.spec.ts`.
  The next seam is now pinned around the four compatibility grant builders still inlined in `src/oauthStore.ts`.
  Verified red with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCompatibilityGrants.spec.ts`
  which failed because `src/oauthCompatibilityGrants.ts` does not exist yet and `oauthStore.ts` still persists compat grants by rebuilding four near-identical `normalizeGrant({...})` objects inline.

- [x] Task 2: Implement the narrow shared seam
  Test to write:
  Reuse the failing tests from Task 1.
  Code to implement:
  Extract the smallest clean shared helper/module for the chosen overlap and migrate only the duplicated responsibility onto it.
  Keep grant ownership, token rotation rules, exchange validation, and persistence semantics stable.
  How to verify it works:
  Re-run the targeted OAuth specs and show them passing.
  Then run `npm run lint:duplicates` and record the hotspot movement for `src/oauthStore.ts` and `src/oauthCore.ts`.
  Result:
  Added `src/oauthCompatibilityGrants.ts` with four narrow compatibility-grant builders for authorization-code, pending-authorization, pending-consent, and refresh-token persistence.
  Updated `src/oauthStore.ts` to use those builders instead of rebuilding four near-identical `normalizeGrant(...)` payloads inline.
  Verified green with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthCompatibilityGrants.spec.ts src/oauthStore.spec.ts`

- [x] Task 3: Add failing coverage for architectural boundaries after the seam lands
  Test to write:
  Add a narrow structure/quality test that fails unless the remaining OAuth/token/exchange responsibilities stay clearly separated.
  The goal is to prevent a cleanup from turning into an over-broad abstraction that mixes persistence, validation, and exchange orchestration.
  Code to implement:
  No production code yet beyond the failing guard.
  How to verify it works:
  Run the targeted OAuth/structure Vitest coverage and show the red failure.
  Result:
  Added a red structural guard in `src/duplicateCodeRemediation.spec.ts` requiring compatibility persistence to stay local to `oauthStore.ts` behind one narrow save helper and requiring `src/oauthCompatibilityGrants.ts` to remain pure.
  Verified red with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts`
  which failed because `oauthStore.ts` still repeated the compatibility grant save/persist path inline and did not define `saveCompatibilityGrant(...)`.

- [x] Task 4: Implement the follow-up cleanup and final verification
  Test to write:
  Reuse the failing coverage from Task 3.
  Code to implement:
  Finish the smallest follow-up cleanup needed to keep the new seam durable and architecturally honest.
  Update docs or task notes only if verification changes the architectural reading of the family.
  How to verify it works:
  Run:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthGrantViews.spec.ts src/oauthStore.spec.ts src/oauthCore.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  Then record:
  the before/after OAuth hotspot movement,
  the updated scorecard status for the OAuth/token/exchange family,
  and whether the remaining overlap now looks `partially consolidated` or `appropriately separated`.
  Result:
  Added `saveCompatibilityGrant(...)` inside `src/oauthStore.ts` so compatibility persistence remains store-owned without expanding the shared helper beyond pure grant shaping.
  Final verification passed with:
  `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthGrantViews.spec.ts src/oauthCompatibilityGrants.spec.ts src/oauthStore.spec.ts src/oauthCore.spec.ts`
  `npm run lint:duplicates`
  `npm run tech-debt:report`
  `npm run typecheck`
  OAuth hotspot movement from the latest JSCPD report:
  `src/oauthStore.ts`: `310` duplicated lines / `38` clones / `39.14%` before -> `274` duplicated lines / `34` clones / `37.59%` after
  `src/oauthCore.ts`: `84` duplicated lines / `17` clones / `17.28%` before -> `84` duplicated lines / `17` clones / `17.28%` after
  `src/oauthCompatibilityGrants.ts`: new focused helper module with `26` duplicated lines / `4` clones / `30.23%`
  Updated architectural reading:
  the OAuth/token/exchange family is still `partially consolidated`, but one more architecturally unnecessary overlap is now removed and compatibility persistence is cleaner without forcing orchestration and storage into one abstraction.

## Review Bar

- The chosen seam removes a real duplicate OAuth/token/exchange responsibility, not just a few similar lines.
- OAuth behavior stays stable under targeted specs.
- The extraction is narrow and readable, not a speculative framework.
- The final summary explains what overlap was removed and what overlap remains intentionally separate.

Plan ready. Approve to proceed.
