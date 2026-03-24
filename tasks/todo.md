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
