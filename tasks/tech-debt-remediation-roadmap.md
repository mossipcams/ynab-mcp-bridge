# Tech Debt Remediation Roadmap

## Goal

Turn the tech debt review into a practical execution sequence that reduces risk first, then improves maintainability, then cleans up scaling and repo ergonomics.

## Quick Win (Day Zero)

The `oauthBroker.spec.ts` test "logs callback failures through the shared oauth logger" is failing because the callback catch path in `oauthBroker.ts` line 377 bypasses the shared logger sink and writes raw `console.error()` output. Changing that call site is still the smallest first cleanup, but it does **not** green the suite by itself:

- `logOAuthDebug()` currently also writes to `console.error()`, so the broader OAuth logging path still misses the shared test sink.
- `releasePlease.spec.ts` is failing independently on branch-sensitive published-tag validation.

Treat the callback-path fix as the first slice of item 1, not as a standalone suite-greening step.

## P0

### 1. Unify Logging and Fix Logging Test Drift

- Priority: `P0`
- Size: `M`
- Why now:
  - Logging is split between structured Pino-based app logging and raw `console.error` output.
  - `logOAuthDebug()` itself is a raw `console.error` wrapper — it never touches Pino. All 15 call sites in `oauthBroker.ts` bypass the structured logger, not just the catch block at line 377.
  - `profileLogger.ts` bypasses Pino entirely with `console.error("[profile]", ...)`.
  - The failing test asserts Pino JSON fields (`msg`, `scope`, `event`) from a test sink — no amount of reshuffling `console.error` call sites will satisfy it without routing through the actual Pino logger.
  - This split breaks redaction, test sinks, and structured log consumers.
- Primary targets:
  - `src/logger.ts`
  - `src/oauthBroker.ts`
  - `src/clientProfiles/profileLogger.ts`
  - `src/oauthBroker.spec.ts`
  - `src/clientProfiles.spec.ts`
- Work:
  - Rewrite `logOAuthDebug()` to route through `logAppEvent("oauth", ...)` so all 15 OAuth log call sites produce Pino-structured output.
  - Rewrite `logClientProfileEvent()` in `profileLogger.ts` to route through `logAppEvent("profile", ...)`.
  - Remove all direct `console.error` usage from runtime logging paths.
  - Normalize event naming and field shape.
  - Update tests so they assert structured log behavior instead of raw console shape.
- Acceptance criteria:
  - All runtime logging paths use the shared Pino logger.
  - Redaction and test sinks apply consistently.
  - The current logging-related failing test is green.
- Parallelizable with: Item 2 (no file overlap).

### 2. Repair Release Validation and Broken Release Metadata Checks

- Priority: `P0`
- Size: `S/M`
- Why now:
  - The release metadata test is currently branch-sensitive and failing.
  - `getHighestPublishedTagVersion()` in `releasePlease.spec.ts` uses `git tag --list` and picks the globally highest tag (`v0.14.0`), but `package.json` on this branch is `0.10.6` — the assertion always fails.
  - Release Please PR checks (`.github/workflows/release-please-pr-checks.yml`) are placeholder jobs that just `echo` a message — required status checks pass without any real validation.
- Primary targets:
  - `src/releasePlease.spec.ts`
  - `.github/workflows/release-please-pr-checks.yml`
  - `.github/workflows/test.yml`
  - `.release-please-manifest.json`
  - `package.json`
- Work:
  - Replace the global-highest-tag assertion with one of:
    - **(a)** Compare against the manifest version as source of truth instead of git tags.
    - **(b)** Compare against a branch-aware published-release baseline such as the merge-base tag or the latest release tag reachable from `main`.
    - **(c)** Skip the published-tag assertion on non-release branches entirely.
  - Decision: pick approach before implementation — **(b)** is preferred because it preserves rollback protection without failing on ordinary branches.
  - Keep the existing manifest/package equality assertion separate from the published-release assertion so the test does not become tautological.
  - Make release PR validation run real checks, not placeholder `echo` jobs.
  - Keep manifest/config/changelog validation, but make it resilient to normal branch workflows.
- Acceptance criteria:
  - `npm run test:ci` and `npm run test:coverage` pass on ordinary branches.
  - Release Please branches cannot satisfy required checks without real validation.
- Parallelizable with: Item 1 (no file overlap).

### 3. Make OAuth State Transitions Durable

- Priority: `P0`
- Size: `M/L`
- Why now:
  - Three specific OAuth flow transitions delete old state before new state is safely persisted (line numbers reference the current branch and may shift after item 1 lands):
    1. **`approveConsent`** (line ~324): deletes grant, then saves new grant with `pendingAuthorization`.
    2. **`handleCallback`** (line ~378): deletes grant, then saves new grant with `authorizationCode` and `upstreamTokens`.
    3. **`exchangeAuthorizationCode`** (line ~467): deletes grant, then saves new grant with `refreshToken`.
  - A transient failure between delete and save strands users with no recoverable state.
- Primary targets:
  - `src/oauthCore.ts`
  - `src/oauthStore.ts`
  - `src/oauthCore.spec.ts`
  - `src/oauthStore.spec.ts`
- Work:
  - Design transition helpers per flow — each has different recovery semantics, so a single generic helper is unlikely to fit all three.
  - Rework each transition to write-then-delete (or upsert) instead of delete-then-write.
  - Add regression coverage for upstream failures at each transition point.
- Acceptance criteria:
  - OAuth flows recover safely from transient errors.
  - No critical transition deletes state before the replacement state is durable.
- Rollback: Revert the commit. The old store format is forward-compatible — no migration needed.

### 4. Reduce Sensitive OAuth Material in Persistent Storage

- Priority: `P0`
- Size: `M`
- Why now:
  - The JSON store persists full `upstreamTokens` (access + refresh), authorization codes, and bridge refresh tokens as plaintext JSON on disk.
  - This increases the blast radius of filesystem compromise.
- Primary targets:
  - `src/oauthGrant.ts` — defines `OAuthGrant` type including `upstreamTokens?: OAuthTokens`
  - `src/oauthStore.ts` — persists full grants including all secret-bearing fields
- Note: `src/localTokenService.ts` was previously listed here but it only mints JWTs at runtime using an in-memory secret — it does not persist secrets to disk and is not a target for this item.
- Work:
  - Minimize persisted upstream token material.
  - Evaluate whether access tokens need persistence at all (they may be derivable from refresh tokens).
  - Harden storage behavior and document operational assumptions.
- Acceptance criteria:
  - Upstream access tokens are no longer persisted to disk (derived from refresh tokens on demand).
  - Persisted grants no longer retain upstream access tokens after callback/token exchange completes.
  - Only upstream refresh tokens and bridge refresh tokens remain in persistent storage.
- Rollback: If the new store shape causes issues, revert the commit. Existing stored grants with full `upstreamTokens` will still load — the change only removes fields on write, so no migration is needed to roll back.

## P1

### 5. Centralize Header Parsing and Trust Decisions

- Priority: `P1`
- Size: `S/M`
- Why now:
  - Host/origin/correlation/session parsing is still partially duplicated.
  - The `fix/cors-cf-utility-dedup` branch created `src/headerUtils.ts` and centralized `getFirstHeaderValue`, but two identical local copies remain in `src/cloudflareCompatibility.ts` (line 11-17) and `src/clientProfiles/requestContext.ts` (line 3-9).
  - Proxy trust and forwarded host behavior are currently fragile.
- Status: **Partially complete** — `headerUtils.ts` exists, dedup is incomplete.
- Primary targets:
  - `src/headerUtils.ts`
  - `src/requestContext.ts`
  - `src/originPolicy.ts`
  - `src/cloudflareCompatibility.ts` — still has local `getFirstHeaderValue` copy
  - `src/clientProfiles/requestContext.ts` — still has local `getFirstHeaderValue` copy
- Work:
  - Finish dedup: replace remaining local `getFirstHeaderValue` copies with imports from `headerUtils.ts`.
  - Normalize session parsing, correlation header parsing, and forwarded-host behavior into the shared layer.
  - Add targeted utility specs for failure cases and ambiguous headers.
- Acceptance criteria:
  - Header semantics are consistent across transport, auth, and logging.
  - Forwarded-host and loopback-origin behavior is explicitly tested.
  - Zero duplicate `getFirstHeaderValue` implementations.
- Dependency: Must complete before or alongside item 6 (server decomposition needs to know where header logic lives).

### 6. Split the HTTP Server into Smaller Route-Scoped Modules

- Priority: `P1`
- Size: `L`
- Why now:
  - `src/httpServer.ts` is 859 lines with 10+ order-dependent middleware handlers.
  - Middleware side effects flow implicitly (e.g., `setResolvedClientProfile` must run before auth middleware reads it).
- Primary targets:
  - `src/httpServer.ts`
  - `src/httpServer.spec.ts` (~108 KB / 3.1K lines — also needs decomposition)
  - `src/originPolicy.ts`
- Work:
  - Separate shared ingress middleware, MCP transport routing, and OAuth/auth routes.
  - Reduce repeated path/method checks.
  - Keep behavior stable while shrinking the main file.
- Acceptance criteria:
  - HTTP flow is split into clear modules with narrower responsibilities.
  - Existing behavior is preserved with passing regression coverage.
- Dependency: Item 5 (header centralization) should be done first so decomposed modules import from the shared layer rather than carrying their own copies.

### 7. Remove Mutable Plan Resolution from Shared API State

- Priority: `P1`
- Size: `M`
- Why now:
  - Plan resolution mutates `runtimePlanIdOverride` on the shared `YnabApiRuntimeContext` attached to the API instance.
  - `setRuntimePlanIdOverride()` writes to this shared state; `rememberRuntimePlanId()` calls it as a side effect of successful plan resolution.
  - In long-lived stdio sessions, a plan choice from one tool call bleeds into subsequent calls.
- Primary targets:
  - `src/tools/planToolUtils.ts` — `getRuntimePlanIdOverride()`, `setRuntimePlanIdOverride()`, `rememberRuntimePlanId()`
  - `src/ynabApi.ts` — `YnabApiRuntimeContext` type with mutable `runtimePlanIdOverride` field
  - `src/server.ts`
  - `src/stdioServer.ts`
- Work:
  - Decide on resolution pattern: per-call argument threading vs. request/session-scoped context.
  - Decision should be made before item 9 (tool definition pattern) since the abstraction needs to incorporate whatever plan resolution approach lands here.
  - Replace `runtimePlanIdOverride` mutation with the chosen pattern.
  - Preserve current fallback behavior without shared mutable state.
  - Add direct tests for plan resolution behavior.
- Acceptance criteria:
  - Plan choice cannot bleed across calls through a shared API instance.
  - Plan resolution logic has direct unit coverage.

### 8. Split Config Ownership into Real Modules

- Priority: `P1`
- Size: `S`
- Why now:
  - `src/config.ts` currently owns too many concerns.
  - `src/runtimeConfig.ts` is a pure re-export facade: `export { assertBackendEnvironment, resolveRuntimeConfig } from "./config.js"` with zero additional logic.
- Primary targets:
  - `src/config.ts`
  - `src/runtimeConfig.ts`
  - `src/config.spec.ts`
  - `src/runtimeConfig.spec.ts`
- Work:
  - Separate YNAB config, runtime transport config, and OAuth config concerns.
  - Either make `runtimeConfig.ts` a real ownership boundary or remove it.
  - Reduce duplicated config test matrices.
- Acceptance criteria:
  - Config modules have clear ownership and smaller APIs.
  - Tests are more focused and less duplicated.

### 9. Add Direct Coverage for Shared Helpers

- Priority: `P1/P2` (pull forward before large refactors)
- Size: `S/M`
- Why now:
  - Several central helpers are relied on heavily but tested only indirectly.
  - `planToolUtils.spec.ts` is 1.3K; many tools have zero dedicated specs.
  - `httpServer.spec.ts` at ~108 KB carries disproportionate testing weight.
  - Adding focused helper tests before items 3-7 de-risks those refactors.
- Primary targets:
  - `src/tools/planToolUtils.ts`
  - `src/tools/collectionToolUtils.ts`
  - `src/tools/financialDiagnosticsUtils.ts`
  - `src/tools/errorUtils.ts`
  - `src/requestContext.ts`
- Work:
  - Add focused unit tests for the shared helper layer.
  - Reduce dependence on giant end-to-end specs for basic utility correctness.
- Acceptance criteria:
  - Shared helper behavior is pinned directly by small, local tests.
  - Refactors can proceed with less reliance on broad integration suites.

## P2

### 10. Introduce a First-Class Tool Definition Pattern

- Priority: `P2`
- Size: `M`
- Why now:
  - Tool registration is manual and repetitive — 48 near-identical entries in a static array in `server.ts`, each with an import, 5 boilerplate properties, and a manual type cast in the execute wrapper.
  - Shared schema/wrapper logic is duplicated across many tool files.
- Primary targets:
  - `src/server.ts`
  - `src/tools/*`
  - `src/serverFactory.spec.ts`
- Work:
  - Create a `defineTool` or `createReadTool` abstraction.
  - Co-locate title, schema, metadata, and execution contract in each tool definition.
  - Replace repeated `planId`, pagination, and wrapper patterns with shared builders.
- Acceptance criteria:
  - Adding a tool requires minimal central wiring.
  - Tool definitions are more self-contained and consistent.
- Dependency: Item 7 (plan resolution) must land first — the tool abstraction should incorporate the new plan resolution pattern rather than baking in the current mutable approach.

### 11. Consolidate the Transaction Tool Family

- Priority: `P2`
- Size: `M`
- Why now:
  - Transaction tools have split into two divergent behavior patterns:
    - `SearchTransactionsTool` (~6.8 KB / 206 lines): full client-side filtering/sorting engine with `matchesFilters()`, `compareTransactions()`, date ranges, amount ranges, and in-memory pagination.
    - `ListTransactionsTool` (~2.9 KB / 88 lines): thin API wrapper with minimal logic, no filtering, direct pagination pass-through.
  - `GetTransactionsBy*` tools are somewhere in between and drifting.
- Primary targets:
  - `src/tools/SearchTransactionsTool.ts`
  - `src/tools/ListTransactionsTool.ts`
  - `src/tools/GetTransactionsByAccountTool.ts`
  - `src/tools/GetTransactionsByCategoryTool.ts`
  - `src/tools/GetTransactionsByMonthTool.ts`
  - `src/tools/GetTransactionsByPayeeTool.ts`
- Work:
  - Build one query/presentation engine for transaction retrieval.
  - Make the `GetTransactionsBy*` tools delegate to shared filtering/pagination/projection behavior.
  - Normalize output shape and month validation semantics.
- Acceptance criteria:
  - Transaction tools share one core implementation path.
  - Output shape and filtering semantics are consistent.

### 12a. Stop Shipping Test Helpers in Package Output

- Priority: `P2`
- Size: `S`
- Why now:
  - `src/oauthTestHelpers.ts` and similar test-only code are emitted into `dist/` and included in package output.
- Primary targets:
  - `package.json`
  - `tsconfig.json`
  - `src/oauthTestHelpers.ts`
- Work:
  - Exclude test-only helpers from the build output.
- Acceptance criteria:
  - Package output contains only runtime artifacts.

### 12b. Decide `dist/` Tracking Policy

- Priority: `P2` (but decide early)
- Size: `S`
- Why now:
  - Tracked `dist/` creates noisy diffs on every change and inflates PRs.
  - This is a one-way-door decision that affects CI, consumers, and every other item in this roadmap.
- Decision: Should `dist/` remain tracked, or should CI build and publish instead?
- Note: Decide this before starting P1 work to avoid amplifying `dist/` churn during refactors.
- Acceptance criteria:
  - Policy is documented and CI is aligned with the decision.

### 12c. Add Local Preflight Command

- Priority: `P2`
- Size: `S`
- Why now:
  - No single local command reproduces what CI checks.
- Work:
  - Add a documented local preflight command that matches CI gates.
- Acceptance criteria:
  - Local validation guidance matches actual CI gates.

## Dependency Graph

```
Items 1, 2           (parallel — no file overlap)
Item 3 → Item 4      (sequential — both touch oauthStore.ts, one work stream)
Item 9 → Items 3–7   (pull forward helper tests before large refactors)
Item 5 → Item 6      (header centralization before server decomposition)
Item 7 → Item 10     (plan resolution pattern before tool abstraction)
Item 12b             (decide before P1 work begins)
```

## Recommended Execution Order

1. **Item 1**: Logging unification — rewrite `logOAuthDebug()` and `logClientProfileEvent()` to route through Pino so the failing test and all OAuth/profile logging reach the shared sink.
2. **Parallel**: Release validation repair (item 2) and `dist/` policy decision (item 12b).
3. **Item 9**: Pull forward focused helper test coverage for the surfaces that upcoming refactors will stress most.
4. **Sequential stream**: OAuth transition durability (item 3) then secret-storage reduction (item 4) — both touch `oauthStore.ts`.
5. **Sequential**: Header centralization (item 5) then HTTP decomposition (item 6).
6. Plan-resolution refactor (item 7) then config ownership (item 8).
7. Tool-surface consolidation (items 10, 11) and remaining repo/package cleanup (items 12a, 12c).

## Suggested Milestones

### Milestone 1

- Logging unification (item 1), release validation repair (item 2), `dist/` policy decision (item 12b), pulled-forward helper coverage (item 9), and all remaining `P0` items (3, 4).
- End state:
  - The currently failing logging and release-validation tests are green again.
  - Logging is coherent.
  - OAuth correctness and secret handling are materially safer.
  - The highest-risk upcoming refactors have focused helper coverage in place first.

### Milestone 2

- `P1` items: header centralization (5) → server decomposition (6), plan resolution (7), config ownership (8).
- End state:
  - Main coordination modules are smaller and easier to reason about.
  - Shared transport/config behavior is explicit and better tested.

### Milestone 3

- Complete remaining `P2` items: tool definition pattern (10), transaction consolidation (11), repo cleanup (12a, 12c).
- End state:
  - Tool growth is cheaper.
  - Transaction tools share a single engine.
  - Repo ergonomics are cleaner and less noisy.

## Notes

- This roadmap is based on the current tech debt review, subagent group reviews, and a code-verified review pass.
- It is intentionally ordered by risk reduction first, then maintainability, then cleanup.
- If implementation work starts, break each item into smaller TDD tasks before editing runtime code.
- Size estimates: S = half day, M = 1-2 days, L = 2-4 days. These are rough guides, not commitments.
