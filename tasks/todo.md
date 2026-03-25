# Tech Debt Remediation Execution Plan

## Goal

Implement the remaining work in `tasks/tech-debt-remediation-roadmap.md` in the roadmap order, using small TDD slices, while keeping the current dirty checkout safe.

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`.
- The worktree is already dirty with unrelated local changes, so implementation should be isolated in a fresh branch/worktree from the latest `main` unless you explicitly want work to continue here.
- Repo rules require a stop after this plan and approval before runtime code changes.
- Repo rules require red-first TDD for code changes, one task at a time, with a stop after each task.
- Repo rules allow Markdown-only edits and administrative git/worktree setup without TDD.
- `tasks/lessons.md` currently emphasizes updating the plan when priorities shift; this plan follows the roadmap's risk-first order.
- Recommended `dist/` policy for this pass: keep `dist/` tracked for now, document that decision, and align validation around it. Removing tracked `dist/` is a one-way-door publish-process change that should not be coupled to the higher-risk runtime refactors in this roadmap.

## Assumptions

- Existing specs under `src/*.spec.ts` can be updated as part of TDD because they are not under a `tests/` directory.
- Targeted spec runs will be used for each slice first, then broader suites as confidence checks.
- When a roadmap item depends on an architectural choice, I will make the smallest choice that satisfies the acceptance criteria and keeps follow-on items simpler.

## Tasks

- [x] Task 0: Isolate implementation work from the dirty checkout
  Test to write:
  None. This is branch/worktree setup only.
  Code to implement:
  Create or reuse a clean worktree from the latest `main`, then copy this plan context forward there before starting Task 1.
  How to verify it works:
  Confirm the new worktree is on a fresh branch from current `main`, `git status` is clean there, and this current checkout remains undisturbed.

- [x] Task 1: Add failing logging coverage for shared OAuth and profile sinks
  Test to write:
  Extend `src/oauthBroker.spec.ts` and `src/clientProfiles.spec.ts` so they fail unless OAuth callback failures, non-callback OAuth events, and profile events all flow through the shared Pino sink with structured `scope`, `event`, and redacted fields.
  Code to implement:
  No production code in this task. Only red tests that pin the structured logging contract.
  How to verify it works:
  Run the targeted Vitest files and show the logging assertions failing against the current raw `console.error` paths.

- [x] Task 2: Route OAuth and profile logging through the shared logger
  Test to write:
  Reuse the failing specs from Task 1.
  Code to implement:
  Update `src/oauthBroker.ts` so `logOAuthDebug()` and the callback error path call `logAppEvent("oauth", ...)`, update `src/clientProfiles/profileLogger.ts` to use `logAppEvent("profile", ...)`, and normalize event/detail shape without direct runtime `console.error` usage in those paths.
  How to verify it works:
  Re-run the targeted logging specs and show them passing, then run a focused grep to confirm the runtime OAuth/profile logging paths no longer use direct `console.error`.

- [x] Task 3: Add failing release validation coverage for branch-safe published baselines and real PR checks
  Test to write:
  Extend `src/releasePlease.spec.ts` so it fails unless the published-version baseline is branch-aware instead of globally highest-tag based, and unless `release-please-pr-checks.yml` runs real validation steps instead of placeholder `echo` jobs.
  Code to implement:
  No production code in this task. Only red tests that define the safer release contract.
  How to verify it works:
  Run `npx vitest run src/releasePlease.spec.ts` and show the failures proving the current branch-sensitive assertion and placeholder workflow are insufficient.
  Review:
  Current `origin/main` already satisfies this slice through a newer release automation shape. `npx vitest run src/releasePlease.spec.ts` passes without changes, package and manifest are both `0.14.0`, and the old placeholder `release-please-pr-checks.yml` workflow is not present on this branch.

- [x] Task 4: Repair release validation and release-please PR checks
  Test to write:
  Reuse the failing specs from Task 3.
  Code to implement:
  Update `src/releasePlease.spec.ts` support code and the release workflows so published-version validation uses a branch-aware reachable baseline, manifest/package validation stays separate, and release-please PR checks execute real validation commands.
  How to verify it works:
  Re-run `npx vitest run src/releasePlease.spec.ts`, then run `npm run test:ci` and `npm run test:coverage` as the milestone proof for the release-validation slice.
  Review:
  No code change was required on current `origin/main`; the existing release workflow and spec already verify the intended invariants for this branch.

- [x] Task 5: Record and align the `dist/` tracking decision
  Test to write:
  Add or update a lightweight metadata/spec assertion only if needed so repository guidance matches the chosen tracked-`dist/` policy.
  Code to implement:
  Document the decision to keep `dist/` tracked for now, and adjust any affected docs or validation text so the policy is explicit.
  How to verify it works:
  Confirm the repository guidance is internally consistent and that no CI/package assumptions conflict with the documented policy.

- [x] Task 6: Add direct failing coverage for shared helper surfaces needed before refactors
  Test to write:
  Add focused red specs for `src/requestContext.ts`, `src/tools/collectionToolUtils.ts`, `src/tools/financialDiagnosticsUtils.ts`, and `src/tools/errorUtils.ts`, plus any missing edge-case coverage in `src/headerUtils.spec.ts`, so upcoming refactors are pinned by local helper tests instead of only broad integration suites.
  Code to implement:
  No production code in this task. Only failing helper tests and any minimal test fixtures.
  How to verify it works:
  Run the new targeted helper spec set and show the expected failures on currently unpinned behavior.

- [x] Task 7: Implement the missing helper behaviors or exports required by the new coverage
  Test to write:
  Reuse the failing specs from Task 6.
  Code to implement:
  Add the smallest helper-layer code needed so the new shared utility tests pass without changing higher-level behavior.
  How to verify it works:
  Re-run the targeted helper specs and show them passing, then run the directly affected broader specs if a helper feeds an integration-heavy module.

- [x] Task 8: Add failing OAuth durability coverage for `approveConsent`
  Test to write:
  Extend `src/oauthCore.spec.ts` and, if helpful, `src/oauthStore.spec.ts` so they fail unless the `approveConsent` transition survives a persistence failure without deleting the recoverable prior state first.
  Code to implement:
  No production code in this task. Only red tests that define durable write semantics for the consent-approval transition.
  How to verify it works:
  Run the targeted OAuth specs and show the failure demonstrating the current delete-then-save risk.

- [x] Task 9: Implement durable `approveConsent` state transitions
  Test to write:
  Reuse the failing specs from Task 8.
  Code to implement:
  Rework the `approveConsent` flow and any store helper it needs so replacement grant state becomes durable before the prior recoverable state is discarded.
  How to verify it works:
  Re-run the targeted OAuth specs and show them passing, then do a small proof review of persisted state behavior around the updated transition.

- [x] Task 10: Add failing OAuth durability coverage for callback and code-exchange transitions
  Test to write:
  Extend `src/oauthCore.spec.ts` and `src/oauthStore.spec.ts` so they fail unless `handleCallback` and `exchangeAuthorizationCode` preserve recoverable grant state when persistence or upstream steps fail mid-transition.
  Code to implement:
  No production code in this task. Only red tests for the remaining delete-before-save gaps.
  How to verify it works:
  Run the targeted OAuth specs and show the failures in the callback and token-exchange paths.

- [x] Task 11: Implement durable callback and token-exchange transitions
  Test to write:
  Reuse the failing specs from Task 10.
  Code to implement:
  Update the callback and authorization-code exchange flows plus store helpers so they use write-then-delete or equivalent upsert semantics that keep state recoverable through transient errors.
  How to verify it works:
  Re-run the targeted OAuth specs and show them passing, then run the broader OAuth-related spec set for regression coverage.

- [x] Task 12: Add failing coverage for minimized persisted OAuth secrets
  Test to write:
  Extend `src/oauthStore.spec.ts` and `src/oauthCore.spec.ts` so they fail unless persisted grants drop upstream access tokens after callback/token exchange and retain only the minimum secret-bearing fields needed for recovery.
  Code to implement:
  No production code in this task. Only red tests that define the new persisted grant shape and backward-compatible load behavior.
  How to verify it works:
  Run the targeted OAuth specs and show failures proving the current store still writes full upstream token payloads.

- [x] Task 13: Implement minimized OAuth persistence
  Test to write:
  Reuse the failing specs from Task 12.
  Code to implement:
  Update `src/oauthGrant.ts` and `src/oauthStore.ts` write paths so persisted grants no longer retain upstream access tokens after durable transitions complete, while remaining compatible with existing on-disk records during reads.
  How to verify it works:
  Re-run the targeted OAuth specs and show them passing, then inspect a representative serialized state fixture or output to confirm only the intended secrets remain.

- [x] Task 14: Add failing coverage for header parsing dedup and shared request context semantics
  Test to write:
  Add or extend focused specs for `src/headerUtils.ts`, `src/requestContext.ts`, `src/cloudflareCompatibility.ts`, and `src/clientProfiles/requestContext.ts` so they fail unless `getFirstHeaderValue`, session/correlation parsing, and forwarded-host handling all come from the shared layer with consistent ambiguous-header behavior.
  Code to implement:
  No production code in this task. Only red tests defining the shared header contract.
  How to verify it works:
  Run the targeted header/request-context spec set and show the failures on duplicated or inconsistent behavior.

- [x] Task 15: Centralize header parsing and trust decisions
  Test to write:
  Reuse the failing specs from Task 14.
  Code to implement:
  Remove remaining local `getFirstHeaderValue` copies, move shared request-context parsing into the common layer, and align origin/forwarded-host trust behavior behind the shared utilities.
  How to verify it works:
  Re-run the targeted header/request-context specs and show them passing, then use a repo grep to confirm duplicate `getFirstHeaderValue` implementations are gone.

- [x] Task 16: Add route-scoped safety coverage before splitting `httpServer.ts`
  Test to write:
  Add focused red specs for the route/middleware seams that will be extracted from `src/httpServer.ts`, prioritizing ingress/profile detection, OAuth/auth routes, and MCP transport routing, while preserving the current behavior already covered by `src/httpServer.spec.ts`.
  Code to implement:
  No production code in this task. Only extraction-oriented tests that make the route boundaries explicit.
  How to verify it works:
  Run the targeted HTTP server specs and show the newly added boundary tests failing before extraction.

- [x] Task 17: Extract shared ingress and auth route modules from `httpServer.ts`
  Test to write:
  Reuse the failing specs from Task 16.
  Code to implement:
  Split `src/httpServer.ts` into smaller route-scoped modules for shared ingress/profile setup and OAuth/auth flows, keeping behavior stable and imports aligned with the shared header layer.
  How to verify it works:
  Re-run the targeted HTTP specs and show them passing, then run the full `src/httpServer.spec.ts` suite as the broader regression proof.

- [x] Task 18: Extract MCP transport routing and finish HTTP server decomposition
  Test to write:
  Reuse the boundary coverage from Task 16 and add any final red assertions needed for the MCP transport extraction seam.
  Code to implement:
  Finish splitting the remaining transport-routing logic from `src/httpServer.ts`, reduce repeated path/method checks, and leave the main server entry file as thin orchestration.
  How to verify it works:
  Run the focused HTTP specs, then the full HTTP/server-related spec set, and confirm the decomposed modules preserve behavior.

- [x] Task 19: Add failing coverage for cross-call plan override bleed
  Test to write:
  Extend `src/tools/planToolUtils.spec.ts`, `src/serverFactory.spec.ts`, or other direct plan-resolution coverage so they fail unless plan resolution stays scoped to a single call/request and can no longer bleed through a shared API instance.
  Code to implement:
  No production code in this task. Only red tests that pin the non-mutable resolution behavior.
  How to verify it works:
  Run the targeted plan-resolution specs and show the failure demonstrating the current shared `runtimePlanIdOverride` mutation.
  Review:
  Current `origin/main` already behaves correctly for this slice. The direct `withResolvedPlan` regression spec stays green, which shows the old bleed-through no longer reproduces on this branch.

- [x] Task 20: Remove mutable runtime plan override state
  Test to write:
  Reuse the failing specs from Task 19.
  Code to implement:
  Refactor `src/tools/planToolUtils.ts`, `src/ynabApi.ts`, `src/server.ts`, and `src/stdioServer.ts` to use per-call or request-scoped plan resolution instead of mutable shared API state.
  How to verify it works:
  Re-run the targeted plan-resolution specs and show them passing, then run the affected tool/server specs to confirm fallback behavior still works.
  Review:
  No code change was required on current `origin/main`; the direct bleed regression proof already passes.

- [x] Task 21: Add failing coverage for config ownership boundaries
  Test to write:
  Extend `src/config.spec.ts` and `src/runtimeConfig.spec.ts` so they fail unless runtime transport config, OAuth config, and YNAB config are owned by smaller modules with clearer APIs and less duplicated matrix coverage.
  Code to implement:
  No production code in this task. Only red tests pinning the intended ownership boundaries.
  How to verify it works:
  Run the targeted config specs and show the failures proving the current facade/ownership split is too thin.

- [x] Task 22: Split config ownership into real modules
  Test to write:
  Reuse the failing specs from Task 21.
  Code to implement:
  Refactor `src/config.ts` and `src/runtimeConfig.ts` into clearer ownership modules, removing the pure-reexport boundary if it stays empty or turning it into a real ownership seam.
  How to verify it works:
  Re-run the targeted config specs and show them passing, then run typecheck to confirm the new module boundaries compile cleanly.

- [x] Task 23: Add failing coverage for a first-class tool definition pattern
  Test to write:
  Extend `src/serverFactory.spec.ts` and any tool-local specs needed so they fail unless tool definitions can be declared through a shared builder that reduces central boilerplate while respecting the new plan-resolution pattern.
  Code to implement:
  No production code in this task. Only red tests for the desired registration contract.
  How to verify it works:
  Run the targeted server/tool specs and show the failures proving the current manual registration shape is still required.

- [x] Task 24: Introduce the shared tool definition abstraction
  Test to write:
  Reuse the failing specs from Task 23.
  Code to implement:
  Add a `defineTool`/builder pattern, move repeated schema/wrapper metadata toward tool-local ownership, and update `src/server.ts` plus representative tools to use it without changing behavior.
  How to verify it works:
  Re-run the targeted server/tool specs and show them passing, then run the broader server spec set for regression confidence.

- [x] Task 25: Add failing coverage for shared transaction retrieval semantics
  Test to write:
  Extend the transaction-tool specs so they fail unless list/search/get-by-* tools share consistent filtering, pagination, projection, and month-validation behavior through one query engine.
  Code to implement:
  No production code in this task. Only red tests that define the unified transaction semantics.
  How to verify it works:
  Run the targeted transaction-related spec set and show the failures proving the current implementations still drift.

- [x] Task 26: Consolidate the transaction tool family onto one core engine
  Test to write:
  Reuse the failing specs from Task 25.
  Code to implement:
  Build the shared transaction query/presentation layer and make `SearchTransactionsTool`, `ListTransactionsTool`, and the `GetTransactionsBy*` tools delegate to it.
  How to verify it works:
  Re-run the targeted transaction specs and show them passing, then run the broader finance/tool suite impacted by transaction summaries.

- [x] Task 27: Add failing coverage for excluding test-only helpers from build output
  Test to write:
  Add or extend a focused packaging/build assertion so it fails unless files like `src/oauthTestHelpers.ts` are omitted from emitted runtime artifacts.
  Code to implement:
  No production code in this task. Only red tests or packaging assertions that define the expected build output.
  How to verify it works:
  Run the targeted packaging/build validation and show the failure proving test-only helpers still leak into `dist/`.

- [x] Task 28: Exclude test-only helpers from package output
  Test to write:
  Reuse the failing checks from Task 27.
  Code to implement:
  Update the build/package configuration so test-only helpers do not emit into `dist/` or ship in the package output.
  How to verify it works:
  Re-run the targeted packaging/build validation and then run `npm run build` to confirm runtime artifacts exclude test helpers.

- [x] Task 29: Add failing coverage for a local CI-equivalent preflight command
  Test to write:
  Add a small metadata/spec assertion so repository scripts and docs fail unless there is one documented local preflight command that matches the real CI gate set.
  Code to implement:
  No production code in this task. Only red validation for the script/documentation contract.
  How to verify it works:
  Run the targeted validation and show the failure proving there is no single CI-aligned preflight command yet.
  Result:
  Added spec coverage in `src/preflight.spec.ts` to pin the script/documentation contract before wiring the command itself.

- [x] Task 30: Add the local preflight command and final roadmap verification
  Test to write:
  Reuse the failing checks from Task 29.
  Code to implement:
  Add the preflight npm script, document it, and align it with the actual CI validation steps used after the release-check repair.
  How to verify it works:
  Re-run the targeted validation, then run the new preflight command plus final repo-wide checks appropriate to the touched surfaces so the roadmap closes with a full proof pass.
  Result:
  Added the `npm run preflight` script, documented it in `README.md`, and proved the roadmap end-to-end with a clean `npm run preflight` on March 24, 2026 in the isolated worktree.

## Milestones

- [x] Milestone 1: Tasks 0-7
  Outcome:
  Logging and release validation are repaired, `dist/` policy is documented, and shared helper coverage exists before deeper refactors.

- [x] Milestone 2: Tasks 8-15
  Outcome:
  OAuth transitions are durable, persisted OAuth secret handling is reduced, and header/request parsing is centralized.

- [x] Milestone 3: Tasks 16-22
  Outcome:
  HTTP server and config ownership are decomposed into clearer modules, and plan resolution no longer relies on shared mutable state.

- [x] Milestone 4: Tasks 23-30
  Outcome:
  Tool registration and transaction retrieval are consolidated, packaging is cleaner, and local preflight matches CI.

## Review Bar

- The logging and release-validation failures called out in the roadmap are green.
- OAuth flows never delete the only recoverable state before durable replacement exists.
- Persisted OAuth state keeps only the minimum required secret-bearing fields.
- Header parsing, request context, and plan resolution semantics are explicit and directly covered.
- `httpServer.ts`, config ownership, and tool registration are materially simpler without behavior regressions.
- Package output excludes test-only helpers.
- One local preflight command mirrors the real CI gate set.
- Before closing the full roadmap, we should ask whether the result meets a staff engineer review bar.

---

# Git Cleanup Automation Plan

## Goal

Add a safe local automation command that helps prevent branch and worktree sprawl by:

- showing stale worktrees and merged local branches in one place
- defaulting to a non-destructive dry run
- only deleting branches that are merged and not attached to an active worktree
- pruning stale worktree metadata

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`.
- The worktree is already dirty with unrelated local changes.
- Repo rules require a stop after this plan and approval before any code changes.
- Repo branch rules say implementation work should start from the latest `main`, but I should not switch automatically from the current dirty branch. If you approve implementation, I will pause once more before Task 1 if isolation in a fresh branch/worktree from `main` is needed.
- Repo rules say not to modify files in a `tests/` directory unless explicitly asked to. The existing Vitest specs live under `src/`, so targeted spec updates there are allowed.
- The safest automation shape is a dry-run-first CLI with an explicit apply flag, rather than a command that silently deletes git objects on every run.

## Assumptions

- The automation should be repo-local and runnable as an npm script, not a machine-global shell alias.
- A good default command name is `npm run git:cleanup`.
- Dry run output should be readable enough to use as a weekly review command.
- Apply mode should be conservative:
  - fetch/prune remote refs
  - prune stale worktree metadata
  - delete only merged local branches that are not protected and not currently used by any active worktree
- Protected branches should include at least `main`.
- It is acceptable to leave truly active but old worktrees alone instead of trying to infer intent from age alone.

## Tasks

- [ ] Task 1: Add failing coverage for cleanup candidate detection and safety rules
  Test to write:
  Add a focused red spec under `src/` for a new git cleanup module that proves it:
  identifies merged local branch candidates from git output,
  excludes protected branches like `main`,
  excludes the current branch,
  excludes branches attached to active worktrees,
  and flags prunable or missing worktree entries separately from active worktrees.
  Code to implement:
  No production code in this task. Only failing specs and fixture data that define the cleanup contract and the safety exclusions.
  How to verify it works:
  Run the targeted Vitest command for the new spec and show the failures proving the cleanup analyzer does not exist yet.

- [ ] Task 2: Implement the cleanup analyzer and dry-run CLI output
  Test to write:
  Reuse the red tests from Task 1 and add or extend coverage for dry-run summary formatting if needed.
  Code to implement:
  Add a small TypeScript module under `src/` that parses git command output into:
  active worktrees,
  prunable worktrees,
  merged branch cleanup candidates,
  and blocked branches that are still in use.
  Add a CLI entry point that runs the necessary git commands, prints a dry-run summary by default, and exits without deleting anything unless an explicit apply flag is present.
  Add an npm script entry in `package.json` for the new command.
  How to verify it works:
  Re-run the targeted Vitest command and show the tests turning green.
  Then run the dry-run command itself in this repo and confirm the output matches the current local state without deleting anything.

- [ ] Task 3: Add failing coverage for apply-mode command sequencing and deletion guards
  Test to write:
  Extend the new cleanup spec so it fails unless apply mode:
  runs remote/worktree prune steps before deletions,
  deletes only the approved merged branch candidates,
  never deletes the current branch,
  and never deletes branches still attached to an active worktree.
  Code to implement:
  No production code in this task. Only failing tests that pin the exact safe command sequence and guardrails.
  How to verify it works:
  Run the targeted Vitest command and show the failures demonstrating apply behavior is not implemented yet.

- [ ] Task 4: Implement apply mode, document usage, and verify end to end
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Finish the CLI so `--apply` performs the conservative cleanup steps:
  `git fetch --prune`,
  `git worktree prune`,
  removal of stale worktree metadata when applicable,
  and deletion of only safe merged branch candidates.
  Add a short README section documenting dry run versus apply usage and the safety rules.
  How to verify it works:
  Re-run the targeted spec and show it passing.
  Then run the dry-run command in this repo.
  If the implementation can support a non-destructive preview of apply actions, use that as the smallest meaningful proof beyond unit tests.
  Finally run `npm run typecheck` to confirm the new module and CLI compile cleanly.

## Review Bar

- The default command is safe and non-destructive.
- Apply mode cannot delete `main`, the current branch, or a branch still checked out by any active worktree.
- The command gives one obvious path to regular cleanup instead of relying on memory.
- The output is clear enough that future cleanup can become routine rather than an occasional rescue operation.

# Calculation Logic Remediation Plan

## Goal

Fix the highest-impact YNAB calculation issues from the audit so the finance analytics tools use consistent money semantics, stop misclassifying transfers and refunds, and expose outputs that an LLM can interpret correctly.

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`.
- The worktree is already dirty with unrelated local changes, so any future implementation should stay narrowly scoped unless we first isolate the work in a fresh branch/worktree.
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

- [ ] Task 1: Add failing coverage for shared money-classification semantics
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

- [ ] Task 2: Implement shared money classification and replace `Math.abs(activity)` spending logic
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

- [ ] Task 3: Add failing coverage for month-scoped cleanup and health excluding transfer noise
  Test to write:
  Extend `src/financeAdvancedTools.spec.ts` and `src/financialDiagnostics.spec.ts` so they fail unless month cleanup and health counts exclude on-budget transfers from uncategorized backlog and other cleanup metrics.
  Include a fixture where a transfer is uncategorized by design and must not be reported as user cleanup work.
  Code to implement:
  No production code in this task. Only failing tests for transfer-aware cleanup semantics.
  How to verify it works:
  Run `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the failures proving transfer transactions are currently over-counted.

- [ ] Task 4: Implement transfer-aware cleanup and health query fixes
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Update `GetBudgetCleanupSummaryTool.ts` and `GetFinancialHealthCheckTool.ts` to exclude transfer transactions from cleanup counts.
  Where the contract is explicitly month-based, prefer month-specific transaction fetches or equivalent exact month filtering with the transfer-aware classifier.
  How to verify it works:
  Re-run `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the red tests turning green.
  Then run `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` to confirm no finance-summary regression.

- [ ] Task 5: Add failing coverage for true-income versus generic positive inflow semantics
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

- [ ] Task 6: Implement tighter income semantics and expose any unavoidable ambiguity
  Test to write:
  Reuse the failing specs from Task 5.
  Code to implement:
  Update `GetIncomeSummaryTool.ts` to use a stricter income classifier.
  If the available API data cannot reliably separate every positive inflow type, surface that limitation explicitly in the payload or tool description rather than silently calling all positive inflows "income".
  Keep the implementation minimal and grounded in YNAB fields that actually exist.
  How to verify it works:
  Re-run `npx vitest run src/financeAdvancedTools.spec.ts` and show the tests passing.
  Then run the broader finance specs to confirm no regression in downstream summaries that reference income.

- [ ] Task 7: Add failing coverage for obligation-window forecasting semantics
  Test to write:
  Extend `src/financeAdvancedTools.spec.ts` and `src/financialDiagnostics.spec.ts` so they fail unless:
  upcoming obligation outputs separate due outflows from expected inflows,
  transfer-like scheduled transactions are excluded,
  and repeated schedules inside a 30-day window are not silently undercounted.
  Code to implement:
  No production code in this task. Only failing specs that define the forecast contract.
  How to verify it works:
  Run `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the failures proving the current obligation math mixes inflows with obligations and only counts `date_next`.

- [ ] Task 8: Implement expanded obligation forecasting and align health-check cash-risk inputs
  Test to write:
  Reuse the failing specs from Task 7.
  Code to implement:
  Update `GetUpcomingObligationsTool.ts` to expand recurring scheduled transactions across the 7/14/30 day windows, exclude transfers, and return outflows separately from inflows.
  Update `GetFinancialHealthCheckTool.ts` so its `upcoming_30d_net` or equivalent risk input is based on the corrected obligation model.
  How to verify it works:
  Re-run `npx vitest run src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts` and show the new tests passing.
  Then run the broader finance suite to confirm the health-check output remains stable apart from the intentional semantic correction.

- [ ] Task 9: Add failing coverage for ratio and trend labels that currently overstate meaning
  Test to write:
  Add focused assertions in `src/financeAdvancedTools.spec.ts`, `src/financeSummaryTools.spec.ts`, `src/serverFactory.spec.ts`, or `src/codeQuality.spec.ts` so they fail unless:
  `ynab_get_70_20_10_summary` uses a single basis or explicitly labels mixed-basis buckets,
  `assigned_vs_spent` fields are described as timing/buffering metrics rather than discipline scores,
  and category/group trend summaries surface enough context to avoid silent history rewrites when group names change.
  Code to implement:

# PR 154 CI / Mergeability Remediation Plan

## Current Findings

- PR `#154` currently has no failing GitHub Actions checks.
- The only attached check is `validate-pr-title`, and it is passing.
- GitHub reports the PR as `mergeable: CONFLICTING` with `mergeStateStatus: DIRTY`.
- There are no `CI` workflow runs for branch `feat/finance-summary-priorities` under the `pull_request` event.
- A synthetic merge against `origin/main` shows overlapping edits in these files:
  - `src/financeAdvancedTools.spec.ts`
  - `src/financeSummaryTools.spec.ts`
  - `src/serverFactory.spec.ts`
  - `src/tools/GetBudgetHealthSummaryTool.ts`
  - `src/tools/GetCashFlowSummaryTool.ts`
  - `src/tools/GetFinancialSnapshotTool.ts`
  - `src/tools/financeToolUtils.ts`
  - `tasks/todo.md`

## Assumptions

- The user-visible "CI failed" symptom is most likely a missing or blocked `CI` run caused by the PR branch being out of date and conflicting with `main`.
- The safest fix is to update the PR branch with `main`, resolve the overlapping finance-summary conflicts carefully, and then run the impacted local checks before pushing.
- Because the current worktree is on a different dirty branch, implementation should happen in an isolated worktree or branch for PR `#154` rather than inside the present checkout.

## Tasks

- [ ] Task 1: Isolate PR `#154` in a safe worktree and reproduce the merge conflict set
  Test to write:
  No new automated test in this task. This is setup and conflict reproduction only.
  Code to implement:
  Create or reuse an isolated checkout for `feat/finance-summary-priorities`, merge or rebase from the latest `main`, and inspect the exact conflict hunks in the affected finance files.
  How to verify it works:
  Confirm the isolated checkout is on the PR branch, show the conflict file list, and verify the current dirty branch in this worktree was not disturbed.

- [ ] Task 2: Resolve the finance-summary merge conflicts without dropping either side's intended behavior
  Test to write:
  No new red-first test required for pure conflict resolution. Preserve all existing assertions and keep any added specs intact while reconciling the files.
  Code to implement:
  Merge the `main`-side calculation and wording updates with the PR-side monthly review and trajectory additions in the conflicting source and spec files.
  How to verify it works:
  Re-run targeted validation covering the touched finance files and confirm the merged files compile and retain both behavior sets.

- [ ] Task 3: Prove the branch is healthy after conflict resolution and re-check PR status
  Test to write:
  No new test; this task is verification only.
  Code to implement:
  Run the smallest meaningful local suite for the touched files, then check git status/diff for clean conflict resolution and inspect PR checks again after push.
  How to verify it works:
  Show passing local commands for the touched finance suite, confirm no conflict markers remain, and confirm GitHub now schedules or accepts the expected PR checks.

## Review Bar

- The PR is no longer conflicting with `main`.
- No existing finance-summary behavior is silently dropped during conflict resolution.
- Local validation passes before any push.
- PR `#154` shows the expected non-title CI state after the branch update.
  No production code in this task. Only red assertions for contract wording and output clarity.
  How to verify it works:
  Run the targeted Vitest specs and show the failures proving the current tool contracts are semantically too loose.

- [ ] Task 10: Implement contract/description cleanup for ratio, trend, and snapshot semantics
  Test to write:
  Reuse the failing specs from Task 9.
  Code to implement:
  Update the affected tool descriptions and payload labels in:
  `GetBudgetRatioSummaryTool.ts`,
  `GetCategoryTrendSummaryTool.ts`,
  `GetCashFlowSummaryTool.ts`,
  `GetBudgetHealthSummaryTool.ts`,
  and `GetFinancialSnapshotTool.ts`.
  Keep this task focused on truthful semantics and output shape, not on adding brand-new analytics.
  How to verify it works:
  Re-run the targeted specs from Task 9 and show them passing.
  Then inspect the registered tool metadata through the existing registrar coverage to confirm the clarified contracts are exposed at runtime.

- [ ] Task 11: Final verification on the audited analytics surface
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

## Review Bar

- Spending-like fields treat refunds, transfers, and credit-card-payment shuffling correctly.
- Cleanup-style tools do not tell the LLM that normal transfers are uncategorized user mistakes.
- Income outputs are either meaningfully constrained to real income or explicitly labeled when ambiguity remains.
- Obligation windows reflect the full scheduled horizon, not just each item's next occurrence.
- Tool descriptions and payload labels are truthful enough that an LLM can answer finance questions without silently overstating what the server actually computed.

# Finance Summary Priorities Plan

## Goal

Implement the three highest-leverage improvements in this order:

- add a range-based net worth trajectory tool so monthly progress does not require repeated snapshot calls
- add a one-call monthly review tool that bundles the key "how did I do this month?" metrics
- tighten tool descriptions so LLMs stop misreading `assigned_vs_spent` as a discipline score instead of a buffering signal

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`.
- The worktree is already dirty with unrelated local changes.
- Repo rules say implementation work should start from `main`, but I should not switch branches automatically when that could disturb the current checkout. If you approve implementation, I will pause once more before Task 1 if we need to isolate the work in a fresh worktree from `main`.
- The repo instructions also say not to modify files in a `tests/` directory unless explicitly asked to. The existing Vitest files are under `src/`, so targeted spec updates there are allowed.
- The installed YNAB SDK types show `getPlanMonth` returns month/category data, not month-by-month account balances. The net worth trajectory tool therefore needs to derive historical month-end balances from current account balances plus transaction history, rather than reading a native historical balances endpoint.

## Assumptions

- Proposed tool names:
  - `ynab_get_net_worth_trajectory`
  - `ynab_get_monthly_review`
- Net worth trajectory should return month-by-month `net_worth`, `liquid_cash`, and `debt` for an inclusive month range, plus a compact trend summary.
- Historical balances should be reconstructed by walking backward from current account balances using account-linked transaction deltas, including closed but not deleted accounts so prior months are not silently undercounted.
- Monthly review should optimize for one coherent LLM-facing payload, not for reproducing every field from the existing summary tools.

## Tasks

- [ ] Task 1: Add failing coverage for monthly net worth trajectory reconstruction and registration
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

- [ ] Task 2: Implement `ynab_get_net_worth_trajectory`
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

- [ ] Task 3: Add failing coverage for a bundled monthly review payload
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

- [ ] Task 4: Implement `ynab_get_monthly_review`
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

- [ ] Task 5: Add failing coverage for YNAB semantics wording around `assigned_vs_spent`
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

- [ ] Task 6: Implement the tool-description and README guidance pass
  Test to write:
  Reuse the red assertions from Task 5.
  Code to implement:
  Update the relevant tool descriptions in `src/tools/*.ts` so the registry surface consistently explains the YNAB semantics.
  Add a short README note in the finance-summary/tool coverage area clarifying that `assigned_vs_spent` often reflects paycheck timing and budget buffering rather than "discipline".
  Keep this scoped to descriptive guidance, not logic changes.
  How to verify it works:
  Re-run `npx vitest run src/serverFactory.spec.ts src/codeQuality.spec.ts` and show the wording assertions passing.
  Then inspect the registered tool metadata through the existing registrar coverage to confirm the clarified descriptions are actually exposed at runtime.

- [ ] Task 7: Do final verification on the expanded finance-summary surface
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

## Review Bar

- A single MCP tool call can answer month-by-month progress over a date range with `net_worth`, `liquid_cash`, and `debt`.
- Historical monthly balances are reconstructed in a way that handles transfers correctly and does not erase closed-account history.
- A single MCP tool call can answer "how did I do this month?" with a coherent payload rather than requiring the LLM to stitch together multiple fragments.

# Reliability Script Plan

## Goal

Add a repo-local reliability script that repeatedly exercises the bridge over HTTP and produces a compact summary of:

- total requests attempted
- successes and failures
- latency percentiles
- unexpected status or protocol errors
- whether the run met a defined reliability threshold

The first version should be safe, deterministic, and useful for catching flaky transport or server-regression behavior during local development and CI-adjacent validation.

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`.
- The worktree is already dirty with unrelated local changes, so I should not switch branches automatically.
- Repo rules require a stop after this plan and approval before any code changes.
- Repo branch rules say implementation work should start from the latest `main`, but I should pause before Task 1 if you want this isolated in a fresh branch or worktree.
- Repo rules say not to modify files in a `tests/` directory unless explicitly asked to. The existing Vitest specs live under `src/`, so targeted spec additions there are allowed.
- The script should default to non-destructive local behavior and should not hit real YNAB accounts or require real OAuth credentials.
- The project already ships compiled CLIs via `dist`, so the cleanest fit is a TypeScript entry point compiled by `tsc`, plus an npm script that runs the built artifact.

## Assumptions

- The first reliability target should be the authless HTTP transport because it is the cheapest path to repeated end-to-end requests without needing external credentials.
- A good first command shape is `npm run reliability:http`.
- The script should start or target a local server instance, perform repeated `initialize`, `tools/list`, and one lightweight tool call such as `ynab_get_mcp_version`, then shut down cleanly.
- A useful first pass is a bounded soak run with configurable request count and concurrency, not full chaos testing.
- The script should fail with a non-zero exit code when reliability falls below a configurable threshold or when any protocol-invariant check fails.

## Tasks

- [ ] Task 1: Add failing coverage for reliability result aggregation and pass/fail rules
  Test to write:
  Add a focused red spec under `src/` for a new reliability module that proves it:
  records request attempts, successes, and failures,
  calculates summary metrics such as min, max, average, p95, and p99 latency,
  captures protocol or transport failure details without throwing away the whole run,
  and marks the run failed when the error rate exceeds the configured threshold.
  Code to implement:
  No production code in this task. Only failing specs that define the summary contract and threshold behavior for the reliability run.
  How to verify it works:
  Run a targeted Vitest command for the new reliability spec and show the failures proving the aggregation module does not exist yet.

- [ ] Task 2: Implement the reliability runner core
  Test to write:
  Reuse the red tests from Task 1 and extend them if needed to cover concurrency windows and latency recording order.
  Code to implement:
  Add a small TypeScript module under `src/` that runs a bounded batch of async request probes with configurable count, concurrency, and threshold settings.
  The module should return a structured summary object that is easy to print and easy to assert in tests.
  Keep the implementation minimal and deterministic so unit tests do not depend on wall-clock-heavy sleeps.
  How to verify it works:
  Re-run the targeted Vitest command and show the tests turning green.

- [ ] Task 3: Add failing coverage for the HTTP reliability scenario and CLI contract
  Test to write:
  Add or extend a spec under `src/` so it fails unless a CLI entry point:
  accepts bounded request-count and concurrency arguments,
  runs a local HTTP scenario that performs `initialize`, `tools/list`, and a lightweight tool call,
  prints a compact summary with totals and latency metrics,
  and exits non-zero when the reliability threshold is breached.
  Use lightweight stubs or a locally started test server so the spec does not depend on external services.
  Code to implement:
  No production code in this task. Only failing specs that pin the CLI contract, arguments, and summary output.
  How to verify it works:
  Run the targeted Vitest command and show the failures demonstrating the HTTP reliability script does not exist yet.

- [ ] Task 4: Implement the HTTP reliability script and npm entry point
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Add a compiled CLI entry point under `src/` that either starts a local authless HTTP server or targets a provided local URL, executes the bounded reliability scenario, prints the summary, and returns an appropriate exit code.
  Add the npm script entry in `package.json`.
  Keep defaults conservative, with small request counts and moderate concurrency so the command is informative but not noisy.
  How to verify it works:
  Re-run the targeted Vitest command and show the tests passing.
  Then run the new npm command locally with a small bounded configuration and confirm it completes, prints the expected summary, and shuts down cleanly.

- [ ] Task 5: Document usage and verify the implementation bar
  Test to write:
  Add or extend a small documentation or config guard spec only if needed to pin the npm script and documented command name.
  Code to implement:
  Add a short README section describing:
  what the reliability script exercises,
  its safe defaults,
  its key flags,
  and what a failing run means.
  How to verify it works:
  Run the smallest meaningful verification set for the touched specs, then run `npm run typecheck` to confirm the new modules and CLI compile cleanly.

## Review Bar

- The reliability command is safe to run locally and does not require production credentials.
- The first version exercises a real end-to-end HTTP path rather than only unit-level helper functions.
- The summary is compact but actionable enough to spot flakiness quickly.
- Failures produce a non-zero exit code and preserve enough detail to debug the flaky path.
- The implementation is simple enough to extend later with OAuth-mode scenarios or longer soak runs without a redesign.
- Tool descriptions explicitly steer the model away from misreading `assigned_vs_spent` as a behavior score.
- Focused specs and runtime-registry verification provide proof for the new tool surface and the documentation changes.

Plan ready. Approve to proceed.

# Duplication Cleanup And Tech Debt Report Overhaul Plan

## Goal

Reduce the highest-value duplication clusters identified by JSCPD, and overhaul the tech-debt report script so it is easier to maintain, more explicit about its metrics, and safer to extend.

## Constraints And Notes

- Repo rules require stopping after the plan and waiting for approval before any non-Markdown implementation work.
- The current `npm run lint:duplicates` output shows the highest-payoff clusters are:
  - analytics tools
  - OAuth persistence and verifier internals
  - transaction wrapper tools
  - payee-location and money-movement fetchers
  - reliability helpers
- The current `scripts/tech-debt-report.sh` works, but it is a thin shell wrapper around several inline commands. It should be cleaned up while preserving the current output categories:
  - duplication
  - dead exports
  - `ts-ignore` / `ts-expect-error`
  - `eslint-disable`
  - `TODO` / `FIXME` / `HACK`
  - major dependency updates
- The best early duplication target is the transaction-wrapper family because it is smaller than the analytics/OAuth clusters and already has a shared query engine seam.

## Assumptions

- The right first remediation slice is to finish consolidating the transaction-wrapper tools before tackling the much larger analytics and OAuth families.
- The tech-debt report overhaul should keep the command advisory-only and preserve its existing human-readable output header and metric names.
- If shell-only cleanup starts getting awkward, it is acceptable to move the report implementation behind a small Node script while keeping `npm run tech-debt:report` as the stable entry point.

## Tasks

- [x] Task 1: Add failing coverage for the next duplication-remediation seam
  Test to write:
  Extend or add focused specs around the transaction-wrapper tools so they fail unless the repeated wrapper behavior is driven through a narrower shared abstraction instead of duplicated per-tool setup.
  Code to implement:
  No production code in this task. Only the red tests or structure assertions that pin the desired consolidation seam.
  How to verify it works:
  Run the smallest targeted Vitest command for the new coverage and show the failure proving the wrapper duplication is still present.
  Result:
  Added `src/transactionToolStructure.spec.ts` and proved the red state with `npx vitest run src/transactionToolStructure.spec.ts` before the shared wrapper seam existed.

- [x] Task 2: Consolidate the transaction-wrapper duplication
  Test to write:
  Reuse the failing coverage from Task 1.
  Code to implement:
  Refactor the transaction wrapper tools to share one generic wrapper path around `src/transactionQueryEngine.ts`, reducing repeated request/label/projection boilerplate across:
  - `src/tools/ListTransactionsTool.ts`
  - `src/tools/GetTransactionsByMonthTool.ts`
  - `src/tools/GetTransactionsByAccountTool.ts`
  - `src/tools/GetTransactionsByCategoryTool.ts`
  - `src/tools/GetTransactionsByPayeeTool.ts`
  How to verify it works:
  Re-run the targeted specs, then run `npm run lint:duplicates` and confirm the transaction-tool cluster shrinks without behavior regressions.
  Result:
  Added `src/tools/transactionCollectionToolUtils.ts`, centralized the shared input-schema and executor patterns, and reduced JSCPD from `42` clones / `4.12%` duplication to `37` clones / `3.7%`. Verified with `npx vitest run src/transactionToolStructure.spec.ts src/additionalReadTools.spec.ts src/aiToolOptimization.spec.ts` and `npm run lint:duplicates`.

- [x] Task 3: Add failing coverage for a maintainable tech-debt report implementation
  Test to write:
  Add focused contract coverage so it fails unless the tech-debt report implementation is decomposed into explicit metric steps or helpers rather than one opaque inline shell block, while preserving the current output labels and advisory workflow wiring.
  Code to implement:
  No production code in this task. Only red coverage that pins the desired structure and output contract for the report implementation.
  How to verify it works:
  Run the smallest targeted Vitest command and show the failure proving the current report implementation is still too monolithic.
  Result:
  Added `src/techDebtReport.spec.ts` and proved the red state with `npx vitest run src/techDebtReport.spec.ts` while `npm run tech-debt:report` still pointed at the shell entrypoint.

- [x] Task 4: Overhaul the tech-debt report script
  Test to write:
  Reuse the failing coverage from Task 3.
  Code to implement:
  Refactor the report implementation into a cleaner, maintainable structure, likely by:
  - extracting named helpers per metric
  - making JSON parsing and empty-result handling explicit
  - isolating the JSCPD report generation step from the formatting step
  - keeping `npm run tech-debt:report` and the current output categories stable
  How to verify it works:
  Re-run the targeted specs, then run `npm run tech-debt:report` and confirm all metric lines still print correctly.
  Result:
  Replaced the shell implementation with `scripts/tech-debt-report.mjs`, which now exposes explicit metric helpers plus formatting logic while keeping `npm run tech-debt:report` stable. Verified with `npx vitest run src/techDebtReport.spec.ts src/codeQuality.spec.ts src/preflight.spec.ts` and `npm run tech-debt:report`.

- [x] Task 5: Re-rank the remaining duplication backlog and finish verification
  Test to write:
  No new behavioral test unless the refactor reveals a missing regression boundary in the analytics, OAuth, reliability, or payee-location families.
  Code to implement:
  Update `tasks/todo.md` with the refreshed duplication ranking after the first cleanup slice and note the next-best candidate family.
  How to verify it works:
  Run the final proof set:
  - targeted Vitest coverage for the new seams
  - `npm run lint:duplicates`
  - `npm run tech-debt:report`
  - `npm run preflight`
  Result:
  Refreshed the duplication ranking after the transaction-tool cleanup:
  1. analytics tools (`177` duplicated lines across `16` clones)
  2. OAuth persistence and verifier internals (`151` duplicated lines across `11` clones)
  3. payee-location and money-movement fetchers (`51` duplicated lines across `5` clones)
  4. reliability helpers (`49` duplicated lines across `3` clones)
  5. category drill-down tools (`23` duplicated lines across `2` clones)
  The next-best candidate family is analytics tools because it now leads the duplication backlog by a clear margin. Final verification used the targeted Vitest suites, `npm run lint:duplicates`, `npm run tech-debt:report`, and `npm run preflight`.

## Review Bar

- The highest-value low-risk duplication slice is reduced, not just reshuffled.
- The tech-debt report implementation is materially easier to understand and extend.
- JSCPD and the tech-debt report still run from the same stable local commands.
- Verification includes both behavior tests and the real repo-wide quality commands.

Plan ready. Approve to proceed.

# Tech Debt Report Plan

## Goal

Add a checked-in CI tech-debt report script that outputs the requested duplication, dead-export, suppression, comment-marker, and dependency-update counts.

## Constraints And Notes

- This is a follow-on change on top of the already-open roadmap branch and PR.
- Repo rules require stopping after the plan and waiting for approval before any non-Markdown implementation work.
- The current repo already validates quality-tool wiring through `src/codeQuality.spec.ts`, so the safest place to pin the new script and workflow contract is there.
- Your requested report shell uses `jscpd`, `knip`, `jq`, `grep`, `wc`, and `npm-check-updates`.
- Because the script calls `jscpd` directly, we should make that binary reliably available from the repo rather than depending on a globally installed tool.

## Assumptions

- The cleanest implementation is a checked-in shell script such as `scripts/tech-debt-report.sh`, invoked from CI and optionally exposed through `package.json`.
- This should be a reporting step, not a blocking gate, unless you later ask to turn one or more metrics into failures.

## Tasks

- [x] Task 1: Add failing coverage for the tech-debt report contract
  Test to write:
  Extend `src/codeQuality.spec.ts` so it fails unless the repo declares `jscpd` and the other required tooling for the report, includes a checked-in tech-debt report script, and runs that script from a named step in `.github/workflows/test.yml`.
  Code to implement:
  No production code in this task. Only the red spec updates that pin the script/dependency/workflow contract.
  How to verify it works:
  Run `npx vitest run src/codeQuality.spec.ts` and show the failure proving the report is not wired today.
  Result:
  Added red coverage in `src/codeQuality.spec.ts`, and it failed as expected because `scripts/tech-debt-report.sh` and the JSCPD/report workflow wiring did not exist yet.

- [x] Task 2: Implement JSCPD and the tech-debt report script in CI
  Test to write:
  Reuse the failing `src/codeQuality.spec.ts` coverage from Task 1.
  Code to implement:
  Add `jscpd` to `devDependencies`, add a focused JSCPD config if needed, expose a stable local entry point for duplicate detection, add the shell script with the requested output shape, and add a `Run tech debt report` step to `.github/workflows/test.yml`.
  How to verify it works:
  Re-run `npx vitest run src/codeQuality.spec.ts`, then run both the JSCPD command and the tech-debt report locally and show that they print the intended duplication and debt metrics successfully.
  Result:
  Added `.jscpd.json`, `npm run lint:duplicates`, `scripts/tech-debt-report.sh`, `npm run tech-debt:report`, and CI steps for both `Run JSCPD` and `Run tech debt report`. Verified with `npx vitest run src/codeQuality.spec.ts`, `npm run lint:duplicates`, and `npm run tech-debt:report`.

- [x] Task 3: Document the local entry point and finish verification
  Test to write:
  Add or extend a small metadata/doc assertion, likely in `src/preflight.spec.ts` or a nearby quality spec, so it fails unless `README.md` tells contributors how to run the same report locally.
  Code to implement:
  Document the command in `README.md` and, if helpful, expose it as an npm script such as `npm run tech-debt:report`.
  How to verify it works:
  Re-run the targeted spec coverage, then run the final proof set: `npm run preflight` plus the local tech-debt report command or script.
  Result:
  Documented the advisory `npm run lint:duplicates` and `npm run tech-debt:report` commands in `README.md`, added doc-contract coverage in `src/preflight.spec.ts`, and prepared the final proof set.

## Review Bar

- JSCPD is explicitly implemented, runnable locally, and available to the report script without relying on a global install.
- The report script is checked in and matches the requested metric categories.
- CI runs the report from a named workflow step instead of relying on tribal knowledge.
- Contributors have one clear local command to reproduce the report.
- The final verification proves both the contract tests and the real report command work.

Plan ready. Approve to proceed.

# OAuth-Persisted Client Profile Plan

## Goal

Stop relying on per-request heuristics alone for MCP client classification by persisting a conservative compatibility profile on the OAuth client and grant, then reusing that profile on `/token` and authenticated `/mcp` requests.

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`, and the worktree is already dirty.
- Repo rules require stopping after the plan and waiting for approval before any non-Markdown implementation work.
- The bridge is intentionally stateless for HTTP MCP transport, so later `tools/call` requests cannot rely on a durable server-side MCP session to remember `initialize.clientInfo`.
- OAuth can authenticate the client and grant, but it cannot perfectly identify the MCP brand on its own; any stored profile must remain a compatibility classification, not a security boundary.
- `initialize.clientInfo` is helpful but self-reported, so it should refine or confirm a stored profile, not replace authenticated OAuth identity.
- The current logs show:
  - `/mcp` can resolve as `chatgpt`
  - `/token` often falls back to `generic`
  - token refresh still succeeds
  This means the main architectural gap is profile persistence, not OAuth failure.

## Assumptions

- The right persistence anchor is the OAuth client and its associated grants, because those survive across `/authorize`, `/token`, refresh, and authenticated `/mcp`.
- A stored profile should be one of the existing compatibility profiles:
  - `chatgpt`
  - `codex`
  - `claude`
  - `generic`
- When signals are weak or conflicting, we should persist or retain `generic` rather than over-claim a branded client.

## Tasks

- [x] Task 1: Add failing store and core coverage for persisted compatibility profiles
  Test to write:
  Extend `src/oauthStore.spec.ts` and `src/oauthCore.spec.ts` so they fail unless OAuth clients and grants can carry a persisted compatibility profile and that profile survives save/load, grant creation, authorization-code issuance, and refresh-token lookup.
  Code to implement:
  No production code in this task. Only failing specs that define the persisted-profile contract and prove it is available wherever the OAuth flow currently reloads the client or grant.
  How to verify it works:
  Run `npm test -- --run src/oauthStore.spec.ts src/oauthCore.spec.ts` and show the failures proving the store/core model does not yet persist profile data.

- [x] Task 2: Implement conservative OAuth-side profile persistence
  Test to write:
  Reuse the failing coverage from Task 1.
  Add any minimal focused assertions needed to prove weak or conflicting inputs persist `generic` instead of a branded profile.
  Code to implement:
  Update the OAuth data model in the smallest clean way so:
  - OAuth clients can store a compatibility profile inferred from registration metadata and other strong OAuth-time signals
  - grants inherit or carry that profile through authorization and refresh paths
  - persisted state migration remains backward compatible for existing store files
  How to verify it works:
  Re-run `npm test -- --run src/oauthStore.spec.ts src/oauthCore.spec.ts` and show the new tests passing.
  Run `npm run build` if the model changes affect emitted runtime code.

- [x] Task 3: Add failing HTTP coverage proving `/token` and authenticated `/mcp` reuse the persisted profile
  Test to write:
  Extend `src/httpServer.spec.ts` so it fails unless:
  - `/token` logs the persisted compatibility profile for a known OAuth client/grant even when request headers alone would have fallen back to `generic`
  - authenticated `/mcp` requests can recover that stored profile from OAuth-authenticated identity rather than depending only on user-agent or `initialize`
  - mismatched later hints do not silently override authenticated identity with a less safe branded guess
  Code to implement:
  No production code in this task. Only the failing end-to-end specs that pin the behavior we want across auth and MCP.
  How to verify it works:
  Run `npm test -- --run src/httpServer.spec.ts` and show the failures proving the HTTP layer still re-detects too much from per-request hints.

- [x] Task 4: Implement HTTP resolution from authenticated OAuth identity and keep `initialize` as a hint
  Test to write:
  Reuse the failing coverage from Task 3.
  Code to implement:
  Update the HTTP/auth/profile resolution path so:
  - `/token` prefers the persisted compatibility profile tied to the OAuth client/grant
  - authenticated `/mcp` requests prefer the profile tied to the authenticated OAuth `clientId`
  - `initialize.clientInfo` can confirm or refine behavior conservatively, but does not become the authentication source
  - disagreement still falls back safely when necessary
  How to verify it works:
  Re-run `npm test -- --run src/httpServer.spec.ts src/oauthStore.spec.ts src/oauthCore.spec.ts src/clientProfiles.spec.ts`.
  Confirm the relevant `/token` and `/mcp` profile-log assertions now pass without weakening existing generic-fallback behavior.

- [x] Task 5: Verify end-to-end behavior against the reported incident shape
  Test to write:
  No new tests unless a gap appears during execution.
  Code to implement:
  Minimal cleanup only if needed after Tasks 1 through 4.
  How to verify it works:
  Run the focused suite:
  `npm test -- --run src/oauthStore.spec.ts src/oauthCore.spec.ts src/httpServer.spec.ts src/clientProfiles.spec.ts`
  Then run `npm run build`.
  If deployment is in scope after approval, rebuild/restart the service and confirm the journal shows `/token` reusing the persisted profile rather than repeatedly logging `fallback:generic` for the same authenticated client.

## Review Bar

- Client classification is tied to authenticated OAuth identity, not just transient headers.
- The bridge still treats profile as compatibility metadata, not authentication truth.
- Weak or conflicting signals degrade to `generic` instead of over-fitting a branded client.
- `/token` and authenticated `/mcp` stop re-guessing from scratch for the same OAuth client.

Plan ready. Approve to proceed.

## Results

- Added persisted OAuth client compatibility profiles and carried them through grant creation, authorization-code exchange, and refresh rotation.
- Inferred a conservative compatibility profile at OAuth client registration time from stable client metadata such as redirect URIs and client name.
- Updated `/token` profile detection to reuse the stored OAuth client profile when the request would otherwise fall back to `generic`.
- Updated authenticated `/mcp` handling to recover the compatibility profile from the authenticated OAuth `clientId` so stateless follow-up requests do not have to re-identify themselves from scratch.
- Preserved stronger request-level hints when they are explicit, so ChatGPT and Codex user-agent flows still log their original per-request detection reasons instead of being overwritten unnecessarily.

## Verification

- `npm test -- --run src/oauthStore.spec.ts src/oauthCore.spec.ts`
- `npm test -- --run src/httpServer.spec.ts`
- `npm test -- --run src/oauthStore.spec.ts src/oauthCore.spec.ts src/httpServer.spec.ts src/clientProfiles.spec.ts`
- `npm run build`

# PR 150 CI Fix Plan

# Tool Logic Fix Plan

## Goal

Fix the tool-logic issues found in review:

- normalize `"current"` month handling so tools either resolve it to a real month key or never feed it into date math directly
- scope month-based cleanup and health queries to the requested month instead of "since month start"
- stop projection-only collection requests from silently truncating to the default page size
- make compact getter amount fields consistent with the rest of the MCP surface

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`.
- The worktree is already dirty with unrelated local changes.
- Per repo rules, I should not switch branches automatically in a way that could disturb this checkout. If you approve implementation here, I will keep changes minimal and work with the current tree unless you want me to isolate the work first.
- The repo instructions also say not to modify files in a `tests/` directory unless explicitly asked to. The existing Vitest files are under `src/`, so targeted spec updates there are allowed.

## Tasks

- [x] Task 1: Add failing coverage for month default normalization and exact month scoping
  Test to write:
  Extend the focused finance/diagnostic specs in `src/financeSummaryTools.spec.ts`, `src/financeAdvancedTools.spec.ts`, and `src/financialDiagnostics.spec.ts` so they fail unless:
  month-range tools accept omitted month inputs without crashing,
  `"current"` is resolved before date math is applied,
  and `ynab_get_financial_health_check` plus `ynab_get_budget_cleanup_summary` exclude transactions that fall after the requested month.
  Code to implement:
  No production code in this task. Only the red tests that pin the broken behavior discovered in review.
  How to verify it works:
  Run the smallest targeted Vitest command covering those specs and show the failures proving the current implementation mishandles `"current"` and over-counts later transactions.
  Result:
  Added focused red tests in `src/financeSummaryTools.spec.ts`, `src/financeAdvancedTools.spec.ts`, and `src/financialDiagnostics.spec.ts`.
  Verified red with:
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`
  which failed on `"current"` month normalization and exact-month cleanup counts as expected.

- [x] Task 2: Implement shared month normalization and true month-bound filtering
  Test to write:
  Reuse the failing specs from Task 1 as the red signal.
  Code to implement:
  Add a shared helper for resolving month inputs to concrete ISO month keys where needed, update month-range/date-math tools to use that normalized value, and constrain health/cleanup transaction counts to the requested month window instead of relying on a since-date API call alone.
  How to verify it works:
  Re-run the targeted Task 1 specs and show them passing. Then run the broader finance tool specs that cover month-based summaries to confirm the new helper does not regress existing behavior.
  Result:
  Added shared month normalization helpers in `src/tools/financeToolUtils.ts` and updated the month-sensitive summary and cleanup tools to use concrete month keys and exact month-range filtering.
  Verified green with:
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts`

- [x] Task 3: Add failing coverage for projection-only collection requests and amount-format consistency
  Test to write:
  Extend `src/planReadTools.spec.ts` and other relevant `src/*Tools.spec.ts` files so they fail unless:
  list tools return the full collection when only `fields` or `includeIds` are provided without `limit`/`offset`,
  and compact getters such as account/category/month-category return formatted decimal amounts consistent with the transaction and list tools.
  Code to implement:
  No production code in this task. Only the failing expectations needed to lock the intended behavior.
  How to verify it works:
  Run the targeted Vitest specs and show the failures caused by implicit pagination and raw milliunit outputs.
  Result:
  Added projection-only list tests in `src/planReadTools.spec.ts` and `src/additionalReadTools.spec.ts`, and tightened compact getter expectations so amount fields must be decimal strings.
  Verified red with:
  `npx vitest run src/planReadTools.spec.ts src/additionalReadTools.spec.ts`
  which failed on implicit pagination metadata and raw milliunit outputs.

- [x] Task 4: Implement collection-control and amount-format fixes
  Test to write:
  Reuse the red tests from Task 3.
  Code to implement:
  Refine the collection helper logic so pagination only occurs when pagination is actually requested, and update the compact getter tools to serialize amount fields using the same decimal formatting convention already used elsewhere.
  How to verify it works:
  Re-run the targeted Task 3 specs and show them passing. Then run the broader read/finance tool specs to confirm the response shapes remain stable.
  Result:
  Split collection controls into pagination vs projection behavior in `src/tools/collectionToolUtils.ts`, updated the list tools to support full-length projected responses without pagination metadata, and formatted compact getter amounts in the account/category/month-category tools.
  Verified green with:
  `npx vitest run src/planReadTools.spec.ts src/additionalReadTools.spec.ts`

- [x] Task 5: Do final verification on the touched tool surface
  Test to write:
  No new tests in this task. Use the updated focused specs as the proof.
  Code to implement:
  No new production behavior unless verification exposes an additional issue tightly coupled to the approved fixes. If that happens, stop and re-plan before expanding scope.
  How to verify it works:
  Run at minimum:
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts src/planReadTools.spec.ts`
  and, if the touched files justify it, `npm run typecheck`.
  Add a short results section to this file before closing out.
  Result:
  Final verification passed with:
  `npx vitest run src/financeSummaryTools.spec.ts src/financeAdvancedTools.spec.ts src/financialDiagnostics.spec.ts src/planReadTools.spec.ts src/additionalReadTools.spec.ts src/aiToolOptimization.spec.ts`
  and
  `npm run typecheck`

## Results

- `"current"` month defaults are now normalized before date math or transaction since-date queries run.
- Month-scoped cleanup and health summaries now exclude later-month transactions instead of counting everything after the month start.
- Projection-only list requests now return full projected collections without implicit `limit: 50` pagination metadata.
- Compact account/category/month-category getters now serialize amount fields as decimal strings consistent with the rest of the read surface.

## Review Bar

- Omitted month inputs no longer break tools that advertise `"current"` support.
- Month-scoped cleanup and health metrics are based only on transactions inside the requested month.
- Projection-only collection requests do not silently paginate to 50 rows.
- Compact getter amount fields use the same decimal-string convention as the other read tools.
- Focused specs and verification give proof for each fix, not just implementation changes.

Plan ready. Approve to proceed.

## Failure Summary

- PR: `https://github.com/mossipcams/ynab-mcp-bridge/pull/150`
- Failing run:
  - `validate (24.x)` -> `https://github.com/mossipcams/ynab-mcp-bridge/actions/runs/23445008099/job/68206178132`
  - `validate (22.x)` was cancelled after the 24.x failure -> `https://github.com/mossipcams/ynab-mcp-bridge/actions/runs/23445008099/job/68206178088`
- GitHub Actions failure snippet from the March 23, 2026 run shows four failed tests:
  - `src/httpServer.spec.ts` chatgpt profile logging assertion
  - `src/httpServer.spec.ts` codex profile logging assertion
  - `src/oauthBroker.spec.ts` callback failure logging assertion
  - `src/releasePlease.spec.ts` release metadata invariant
- Local reproduction notes:
  - The current checkout is not the PR head and already contains unrelated dirty changes, including local edits in some of the same files.
  - A full local Node 24 run reproduces the `src/oauthBroker.spec.ts` and `src/releasePlease.spec.ts` failures.
  - The two `src/httpServer.spec.ts` failures from GitHub did not reproduce locally on Node 24 against the current mixed checkout, so implementation must start from an isolated PR-head worktree to avoid chasing a false local state.

## Constraints And Notes

- The current branch is `fix/cors-cf-utility-dedup`, not `main`, and the worktree is dirty.
- Per repo rules, implementation should happen in an isolated worktree or branch from the PR head so current local work is not disturbed.
- If the isolated PR-head reproduction does not show the `httpServer` failures, we should not guess at a fix for them. We should fix the two reproducible failures first, rerun Node 24 validation, and then recheck PR status. If `httpServer` still fails remotely after that, stop and re-plan with the fresh failure proof.

## Tasks

- [x] Task 1: Isolate PR 150 head and capture the exact red test set on Node 24
  Test to write:
  No new test in this task. Use the existing failing specs as the red signal in the isolated PR-head checkout:
  `src/httpServer.spec.ts`,
  `src/oauthBroker.spec.ts`,
  and `src/releasePlease.spec.ts`.
  Code to implement:
  Create an isolated worktree or branch from PR 150 head commit `9f1bea828b043f5573704587c78f17e73bc8cca8`, install dependencies there, and run the targeted Node 24 suite so we have a clean reproduction that is not polluted by the current checkout.
  How to verify it works:
  Run the targeted Node 24 Vitest command in the isolated checkout and record exactly which specs fail. If the failure set differs from the GitHub run in a way that changes the plan materially, stop and re-plan before editing code.
  Result:
  Verified in isolated worktree `/Users/matt/Desktop/Projects/_codex_worktrees/ynab-mcp-bridge-pr150-ci` with
  `npx -y node@24 ./node_modules/vitest/vitest.mjs --run src/httpServer.spec.ts src/oauthBroker.spec.ts src/releasePlease.spec.ts`.
  The clean PR-head reproduction matches GitHub's March 23, 2026 failure set:
  two failing assertions in `src/httpServer.spec.ts`, one failing assertion in `src/oauthBroker.spec.ts`, and one failing assertion in `src/releasePlease.spec.ts`.

- [ ] Task 2: Restore structured shared logging for OAuth callback failures
  Test to write:
  Use the existing failing test `src/oauthBroker.spec.ts` -> `logs callback failures through the shared oauth logger` as the red test.
  Code to implement:
  Change the callback failure path in `src/oauthBroker.ts` to emit through the shared structured logger path instead of writing a raw `console.error` tuple, while preserving the current redacted error details and the request correlation fields.
  How to verify it works:
  Re-run `npx -y node@24 ./node_modules/vitest/vitest.mjs --run src/oauthBroker.spec.ts` and show the callback logging assertion passing. Then confirm the emitted entry still contains `scope: "oauth"`, `event: "callback.failed"`, `errorMessage`, `correlationId`, and `requestId`.

- [ ] Task 3: Bring release metadata back in line with published tags
  Test to write:
  Use the existing failing test `src/releasePlease.spec.ts` -> `keeps release metadata ahead of published tags without rollback pins` as the red test.
  Code to implement:
  Update the release metadata files required by the invariant, likely `package.json`, `package-lock.json`, and `.release-please-manifest.json`, and update `CHANGELOG.md` if the chosen version bump or release baseline requires it.
  How to verify it works:
  Re-run `npx -y node@24 ./node_modules/vitest/vitest.mjs --run src/releasePlease.spec.ts` and show it passing. Confirm the checked-in package version and manifest are no longer behind the highest published `ynab-mcp-bridge-v*` tag.

- [ ] Task 4: Re-run the PR validation slice and only fix `httpServer` if the isolated PR head still proves it is broken
  Test to write:
  No new test unless the isolated Node 24 reproduction still fails in `src/httpServer.spec.ts`. If it does, use those existing failing assertions as the red test and add only the smallest missing coverage needed to pin the real regression.
  Code to implement:
  Re-run the full Node 24 suite, plus the targeted `httpServer` assertions, in the isolated checkout after Tasks 2 and 3. If `httpServer` still fails, implement the minimal fix from the reproduction. If it no longer fails, do not make speculative changes there.
  How to verify it works:
  Run `npx -y node@24 ./node_modules/vitest/vitest.mjs --run`.
  If that passes, re-check PR 150 with `gh pr checks 150` and summarize whether the branch is ready for a rerun or whether any external/non-reproducible failure remains.

## Review Bar

- The current dirty checkout stays untouched by implementation work.
- OAuth callback failures are emitted through the shared structured logger with correlation fields intact.
- Release metadata is no longer behind the highest published release tag.
- We only change `httpServer` behavior if we can prove the failure from an isolated PR-head reproduction on Node 24.

Plan ready. Approve to proceed.

# Remove 70/20/10 Tool Plan

## Goal

Remove the `ynab_get_70_20_10_summary` tool from the server registry so it is no longer exposed, and clean up the implementation and coverage that only exist for that tool.

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`.
- The worktree is dirty with unrelated changes already present.
- Per repo rules, implementation should not switch branches automatically in a way that could disturb this checkout. If you approve implementation, I will pause once more before code changes if we need to isolate the work in a fresh branch or worktree from `main`.

## Tasks

- [ ] Task 1: Add a failing registry test that proves the tool is still exposed today
  Test to write:
  Update `src/serverFactory.spec.ts` so it fails unless the registered tool count and tool name lists exclude `ynab_get_70_20_10_summary`, and so the explicit registration assertion no longer expects the `Get 70/20/10 Summary` tool metadata.
  Code to implement:
  No production code in this task. Only the spec changes needed to make removal expectations explicit.
  How to verify it works:
  Run `npm test -- --run src/serverFactory.spec.ts` and show the failure caused by the tool still being registered.

- [ ] Task 2: Remove the tool from the server registry and implementation surface
  Test to write:
  Reuse the failing expectations from Task 1 as the red test.
  Code to implement:
  Remove the `GetBudgetRatioSummaryTool` import and registration from `src/server.ts`, then remove the now-unused implementation file `src/tools/GetBudgetRatioSummaryTool.ts`.
  How to verify it works:
  Re-run `npm test -- --run src/serverFactory.spec.ts` and show it passing. Then run `npm run typecheck` to confirm there are no dangling imports or type errors from the removal.

- [ ] Task 3: Remove direct tool coverage that no longer applies and verify behavior stays clean
  Test to write:
  Update `src/financeAdvancedTools.spec.ts` by removing the `70/20/10` tool case so the suite reflects the supported advanced tools only.
  Code to implement:
  Delete the obsolete spec block and clean up any now-unused imports in that spec file.
  How to verify it works:
  Run `npm test -- --run src/financeAdvancedTools.spec.ts` and then `npm run build` if the targeted tests and typecheck pass, to confirm the repo still compiles without the removed tool.

## Review Bar

- The tool name is absent from the runtime registry.
- No source file imports or references the removed tool.
- Targeted tests, typecheck, and build provide proof that the removal is complete.

Plan ready. Approve to proceed.

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

- [ ] Task 1: Add quality guardrail tests for strict config and lint policy
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

- [ ] Task 2: Tighten TypeScript compiler configuration to the agreed strict baseline
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

- [ ] Task 3: Make ESLint policy explicit for type assertions and unsafe operations
  Test to write:
  Extend the same quality spec so it fails unless `eslint.config.mjs` explicitly sets `@typescript-eslint/consistent-type-assertions` to `"never"` and preserves the type-aware unsafe-operation rules.
  Code to implement:
  Update `eslint.config.mjs` to add explicit rule entries instead of relying only on inherited presets.
  Keep the current test-file overrides intact unless the stricter rules force a small, justified adjustment.
  How to verify it works:
  Run the targeted spec again, then run `npm run lint`. If lint surfaces new unsafe patterns, capture them and stop to re-plan if the fix set expands beyond the planned slice.

- [ ] Task 4: Introduce shared branded-type primitives and readonly-first helper types
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

- [ ] Task 5: Migrate the highest-value public/domain boundaries to the new types
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

- [ ] Task 6: Clean up strictness fallout and complete full verification
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

---

# PR 145 CI Fix Plan

## Failure Summary

- PR: `https://github.com/mossipcams/ynab-mcp-bridge/pull/145`
- Failing checks:
  - `validate (22.x)` -> `https://github.com/mossipcams/ynab-mcp-bridge/actions/runs/23347102744/job/67915348397`
  - `validate (24.x)` -> `https://github.com/mossipcams/ynab-mcp-bridge/actions/runs/23347102744/job/67915348487`
- Shared failure:
  - Tests and dependency rules pass.
  - `npm run lint` aborts in GitHub Actions with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.
- Local safety note:
  - The current checkout is on `fix/cors-cf-utility-dedup` with unrelated uncommitted changes, while PR 145 head is `chore/type-discipline`.
  - Implementation should happen in an isolated branch or worktree so current local work is not disturbed.

## Tasks

- [ ] Task 1: Isolate the PR branch and add a failing guardrail for the lint strategy
  Test to write:
  Extend `src/codeQuality.spec.ts` so it fails unless the repo encodes the chosen CI-safe lint strategy while preserving type-aware linting. The guardrail should verify the exact `lint` script and, if needed, the CI workflow lint step.
  Code to implement:
  Create an isolated worktree or branch for PR 145, then update the guardrail spec only. Do not change production config in this task.
  How to verify it works:
  Run the targeted spec and show it failing for the current PR state before any implementation changes.

- [ ] Task 2: Implement the minimal lint-memory fix without weakening coverage
  Test to write:
  Use the failing guardrail from Task 1 as the red test.
  Code to implement:
  Update the lint configuration with the smallest change that avoids the GitHub Actions OOM while keeping type-aware linting in place. Prefer reducing lint workload or TS program overhead over simply masking the problem; only use a workflow-level memory bump if the cleaner fix is insufficient.
  How to verify it works:
  Re-run the targeted spec to green, then run `npm run lint`. When useful, also run a constrained-memory lint invocation locally to approximate the CI failure mode.

- [ ] Task 3: Prove the CI path still validates the repo end to end
  Test to write:
  Reuse or extend `src/codeQuality.spec.ts` so the workflow still runs the intended validation order and invokes the updated lint command/path.
  Code to implement:
  Apply any small workflow or config follow-up needed for the CI path, keeping the change reviewable and focused on the lint failure.
  How to verify it works:
  Run `npm run test -- --run src/codeQuality.spec.ts`, `npm run lint`, and `npm run typecheck`. If those pass, re-check PR 145 status with `gh pr checks 145` and summarize whether the repo is ready for the next CI rerun.

## Review Bar

- Before closing the fix, sanity-check whether the final change meets a staff-engineer review bar:
  - root cause addressed rather than hidden,
  - current local worktree left untouched,
  - CI guardrails updated so the same class of failure is less likely to recur.

---

# Correlation IDs And MCP Dispatch Visibility Plan

## Goal

Add end-to-end request correlation and bridge-side dispatch telemetry so we can distinguish:

- request reached `/mcp`
- MCP transport handoff occurred
- a `tools/call` was requested for a specific tool
- tool execution started, succeeded, or failed
- OAuth refresh activity belongs to the same user-visible incident when applicable

This is the bridge-scoped slice of the broader link-readiness and catalog-recovery design in `tasks/link-readiness-correlation-design.md`.

## Scope

- In scope:
  - structured correlation IDs for bridge ingress, MCP handoff, tool execution, and OAuth logs
  - targeted tests proving those fields are present and stable through a request
  - safe propagation into existing log events without leaking secrets
- Out of scope for this repo:
  - platform-side link catalog caching
  - forced catalog rehydrate and retry on `Resource not found`
  - link readiness state machine outside the bridge boundary

## Tasks

- [x] Task 1: Add failing logging specs for correlation fields on `/mcp` and `/token`
  Test to write:
  Extend `src/httpServer.spec.ts` so it fails unless `request.received`, `transport.handoff`, and `token.refresh.succeeded` style logs include a generated or propagated `correlationId` and a per-request `requestId`.
  Code to implement:
  No production code in this task. Only the focused spec expectations and any small test helpers needed in `src/httpServer.spec.ts`.
  How to verify it works:
  Run `npm test -- --run src/httpServer.spec.ts` and show the failure proving the correlation fields are currently missing.

- [x] Task 2: Implement bridge ingress correlation and request IDs
  Test to write:
  Reuse the failing assertions from Task 1 as the red test for ingress logging.
  Code to implement:
  Update `src/httpServer.ts` so every incoming request gets:
  - a `requestId`
  - a validated `correlationId` from an inbound header when present or a generated fallback when absent
  Include both fields in the existing HTTP and profile log events and expose the effective correlation ID on the response when appropriate.
  How to verify it works:
  Re-run `npm test -- --run src/httpServer.spec.ts` and show the updated logging assertions passing for both `/mcp` and `/token` requests.

- [x] Task 3: Add tool lifecycle logging with correlation context
  Test to write:
  Add or extend a focused spec, likely in `src/serverFactory.spec.ts` or `src/httpServer.spec.ts`, so it fails unless a `tools/call` request emits `tool.call.started` and `tool.call.succeeded` with `correlationId`, `requestId`, and `toolName`, and emits `tool.call.failed` on execution errors.
  Code to implement:
  Update the server registration wrapper in `src/server.ts` to log tool lifecycle events around each tool execution while preserving the existing result behavior and keeping secrets out of logs.
  How to verify it works:
  Run the smallest targeted spec covering the new lifecycle events, then run `npm test -- --run src/httpServer.spec.ts src/serverFactory.spec.ts` to confirm the bridge logs now distinguish dispatch from execution.

- [x] Task 4: Correlate OAuth refresh logs to incident flows
  Test to write:
  Extend the existing refresh success and failure coverage in `src/httpServer.spec.ts` so it fails unless `token.refresh.succeeded` and `token.refresh.failed` include the active `correlationId` and `requestId`.
  Code to implement:
  Update the OAuth logging path in `src/oauthBroker.ts` and any request-context plumbing needed so refresh logs inherit the current correlation context when the refresh is request-driven.
  How to verify it works:
  Re-run the focused refresh-related specs in `src/httpServer.spec.ts` and show both success and failure assertions passing with correlation-aware fields.

- [x] Task 5: Add a dispatch-gap signal for incidents that stop before tool execution
  Test to write:
  Add a focused spec proving the bridge logs enough information to tell whether a request stopped before tool execution, for example by asserting a distinct log event or explicit field when a request is handed to transport but no `tool.call.started` follows.
  Code to implement:
  Add the smallest bridge-side signal that closes the current observability gap without changing request behavior, likely in `src/httpServer.ts`.
  How to verify it works:
  Run the targeted spec and then `npm test -- --run src/httpServer.spec.ts` to confirm we can now separate transport receipt from tool execution absence.

## Review Bar

- Every `/mcp` and `/token` log path includes `correlationId` and `requestId`.
- A single `tools/call` can be traced from ingress to tool completion in logs.
- OAuth refresh logs can be tied back to the same incident flow when request-driven.
- No secrets or tokens are added to logs.
- The resulting telemetry is strong enough to tell whether a failure happened before MCP execution, during dispatch, or inside a tool.

Plan ready. Approve to proceed.

## Results

- Implemented request-scoped correlation context in `src/requestContext.ts` and propagated `correlationId` plus `requestId` through HTTP ingress, profile detection, and OAuth request-driven logs.
- Added `tool.call.started`, `tool.call.succeeded`, and `tool.call.failed` telemetry in `src/server.ts` with request correlation and `toolName`.
- Added `tool.dispatch.absent` in `src/httpServer.ts` so incidents that reach MCP transport but never start a wrapped tool are visible in logs.
- Kept log payloads free of secrets and token values while extending existing structured and raw diagnostic events.

## Verification

- `npm test -- --run src/httpServer.spec.ts`
- `npm test -- --run src/serverFactory.spec.ts`
- `npm test -- --run src/httpServer.spec.ts src/serverFactory.spec.ts`
- `npm run typecheck`

# OAuth Token Profile Detection Verification Plan

## Goal

Confirm and finish the ChatGPT OAuth profile-detection fix so `POST /token` stops logging `fallback:generic` when the request belongs to the OpenAI MCP flow, then verify the deployed service is actually running the corrected behavior.

## Constraints And Notes

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`, and the worktree is already dirty with relevant uncommitted changes in the profile-detection area.
- Repo rules require stopping after the plan and waiting for approval before any non-Markdown implementation work.
- Local inspection shows the worktree already contains targeted profile-detection changes in:
  - `src/clientProfiles/chatgptProfile.ts`
  - `src/clientProfiles/codexProfile.ts`
  - `src/clientProfiles/detectClient.ts`
  - `src/clientProfiles/requestContext.ts`
  - `src/clientProfiles/types.ts`
  - `src/clientProfiles.spec.ts`
  - `src/httpServer.spec.ts`
- The focused local verification already succeeds on the current worktree:
  - `npm test -- --run src/clientProfiles.spec.ts src/httpServer.spec.ts`
- Because the deployed log still shows `POST /token` as `generic`, the remaining risk is one of:
  - the server on Linux is not running this newer code/build
  - the real `POST /token` request does not carry the ChatGPT signal the current matcher expects
- If deployment verification shows the token request truly has no reusable ChatGPT signal, we must stop and re-plan before adding a stronger cross-request propagation mechanism.

## Assumptions

- The smallest correct fix is to keep request-level pre-auth detection for ChatGPT and Codex based on safe request signals already present on OAuth routes.
- The new detection must not weaken Claude precedence or broaden generic OAuth handling.
- The immediate next step after approval should be to work with the existing dirty changes rather than rewriting them from scratch.

## Tasks

- [ ] Task 1: Prove the regression coverage is the right one for the reported `/token` behavior
  Test to write:
  Reuse the existing focused cases in `src/clientProfiles.spec.ts` and `src/httpServer.spec.ts` that assert ChatGPT/OpenAI-style OAuth requests, including `POST /token`, resolve to `chatgpt` instead of `generic`.
  If those tests are not isolated enough once we start execution, tighten them minimally without weakening any assertions.
  Code to implement:
  No production code in this task unless the current focused specs reveal a small missing assertion.
  The purpose is to establish the red/green target and confirm the current coverage matches the production symptom.
  How to verify it works:
  Run the targeted Vitest command and show the relevant assertions around `POST /token` and OAuth-route profile logs.
  If needed for strict TDD proof, validate the same coverage against the pre-change baseline in an isolated way before continuing.

- [ ] Task 2: Finalize the minimal profile-detection implementation already in flight
  Test to write:
  Use the failing coverage from Task 1.
  Code to implement:
  Keep the implementation narrowly scoped to the existing request-level detection plumbing:
  `src/clientProfiles/chatgptProfile.ts`,
  `src/clientProfiles/codexProfile.ts`,
  `src/clientProfiles/detectClient.ts`,
  `src/clientProfiles/requestContext.ts`,
  and `src/clientProfiles/types.ts`.
  Ensure `POST /token`, `GET /authorize`, `GET /oauth/callback`, and OpenID/discovery routes log actionable detection reasons without disturbing Claude precedence.
  How to verify it works:
  Re-run `npm test -- --run src/clientProfiles.spec.ts src/httpServer.spec.ts` and show the targeted tests passing.
  Run `npm run build` so the runtime artifact matches the source behavior.

- [ ] Task 3: Verify the runtime artifact and deployed service, then confirm the log outcome
  Test to write:
  No new unit tests unless deployment verification reveals a missing runtime assertion.
  Code to implement:
  If needed, update only the build artifact or deployment-facing pieces required to get the already-tested fix onto the Linux host.
  Do not broaden scope into a new propagation design unless Task 2 verification shows the live token request lacks all current detection signals.
  How to verify it works:
  Rebuild and deploy the narrow fix, restart `ynab-mcp-bridge`, and inspect `journalctl -u ynab-mcp-bridge -n 200`.
  The expected proof is that the relevant `/token` request logs `profileId: 'chatgpt'` with a concrete reason instead of `fallback:generic`.
  If the live `/token` request still logs `generic`, capture the exact request signal gap and stop for a re-plan.

## Review Bar

- The repo has focused regression coverage for the exact `/token` symptom from the journal.
- The implementation remains minimal and profile-specific instead of introducing broad OAuth heuristics.
- The built artifact matches the tested source.
- The deployed service shows the corrected profile log behavior, or we have enough concrete evidence to re-plan intelligently instead of guessing.

Plan ready. Approve to proceed.
