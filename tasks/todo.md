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
