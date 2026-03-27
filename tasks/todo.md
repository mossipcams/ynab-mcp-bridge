# CI Blocker Remediation Plan

## Goal

Clear the remaining PR #165 CI failures on `fix/tdd-tech-debt-remediation` after the merge-conflict rebuild, while preserving the verified runtime behavior already green in the focused HTTP/server suite.

## Current Blockers

- `src/httpServerStructure.spec.ts` still asserts the pre-merge `installOAuthRoutes` / `installMcpPostRoute` shape instead of the current `registerOAuthHttpRoutes` / `registerMcpTransportRoutes` module boundary.
- `src/financeAdvancedTools.spec.ts` still imports `GetBudgetRatioSummaryTool`, which is no longer present on current `main`.
- `src/duplicateCodeRemediation.spec.ts` still pins several older helper/refactor shapes that no longer match the merged `main` architecture.
- Local full-suite verification in the isolated worktree also needs one dependency-sync sanity pass so `fast-check` and `eslint-plugin-security` are available for repo-wide validation commands.

## Constraints And Notes

- Runtime-focused verification already passed in the isolated merge-fix worktree:
  `npx vitest run src/httpServer.spec.ts src/serverFactory.spec.ts src/config.spec.ts src/runtimeConfig.spec.ts src/oauthCore.spec.ts src/oauthStore.spec.ts src/aiToolOptimization.spec.ts src/additionalReadTools.spec.ts`
- The original working tree at `/Users/matt/Desktop/Projects/ynab-mcp-bridge` is dirty and should remain undisturbed.
- Implementation should continue in the isolated worktree at `/tmp/ynab-mcp-bridge-pr165-clean.GFK1j5`.
- Repo rules require red-first TDD for code changes, one task at a time, with a stop after each task.
- Markdown-only plan updates do not require TDD.

## Tasks

- [ ] Task 1: Pin the current HTTP server module boundary with a failing spec
  Test to write:
  Update `src/httpServerStructure.spec.ts` so it fails unless `src/httpServer.ts` references the current route-scoped modules and function names: `registerOAuthHttpRoutes`, `registerMcpTransportRoutes`, `httpServerIngress`, and `httpServerTransportRoutes`.
  Code to implement:
  No production code in this task. Only adjust the spec so it captures the current modular boundary instead of the removed `httpServerMcpRoute` / `install*Route` shape.
  How to verify it works:
  Run `npx vitest run src/httpServerStructure.spec.ts` and show the red failure first against the current stale assertions.

- [ ] Task 2: Green the HTTP structure spec against the merged architecture
  Test to write:
  Reuse the failing `src/httpServerStructure.spec.ts` from Task 1.
  Code to implement:
  Apply the minimal spec update needed so the structure assertion matches the merged `httpServer.ts` orchestration and helper module names.
  How to verify it works:
  Re-run `npx vitest run src/httpServerStructure.spec.ts` and show it passing.

- [ ] Task 3: Pin the current advanced finance tool surface with a failing spec
  Test to write:
  Update `src/financeAdvancedTools.spec.ts` so it fails unless the suite reflects the current finance toolset on `main`, removing or replacing the stale `GetBudgetRatioSummaryTool` dependency with coverage for still-supported advanced finance tools.
  Code to implement:
  No production code in this task. Only spec changes to define the intended current tool surface.
  How to verify it works:
  Run `npx vitest run src/financeAdvancedTools.spec.ts` and show the red failure first.

- [ ] Task 4: Green the advanced finance spec set
  Test to write:
  Reuse the failing `src/financeAdvancedTools.spec.ts` from Task 3.
  Code to implement:
  Make the smallest spec update so the suite exercises the current advanced finance tools and no longer imports removed modules.
  How to verify it works:
  Re-run `npx vitest run src/financeAdvancedTools.spec.ts` and show it passing.

- [ ] Task 5: Pin the post-merge duplicate-remediation contract with failing assertions
  Test to write:
  Update `src/duplicateCodeRemediation.spec.ts` so it fails against the current stale expectations and instead describes the helper boundaries that still exist after rebasing onto `main`, especially for list tools, HTTP modularization, and OAuth helper ownership.
  Code to implement:
  No production code in this task. Only refresh the test expectations to match the intended current architecture.
  How to verify it works:
  Run `npx vitest run src/duplicateCodeRemediation.spec.ts` and show the red failure first.

- [ ] Task 6: Green the duplicate-remediation spec set
  Test to write:
  Reuse the failing `src/duplicateCodeRemediation.spec.ts` from Task 5.
  Code to implement:
  Make the minimal spec-only updates needed so the assertions match the current merged helper/module boundaries without weakening the intent of the guardrail.
  How to verify it works:
  Re-run `npx vitest run src/duplicateCodeRemediation.spec.ts` and show it passing.

- [ ] Task 7: Sync local dev dependencies for full-suite verification
  Test to write:
  No new repo test. This is environment alignment for verification only.
  Code to implement:
  Refresh the isolated worktree install so `fast-check` and `eslint-plugin-security` are available locally in line with `package.json` / lockfile, without changing runtime code unless the lockfile proves stale.
  How to verify it works:
  Confirm `npx vitest run src/scopeNormalization.spec.ts` and the ESLint-backed assertion in `src/codeQuality.spec.ts` can execute without module-resolution failures.

- [ ] Task 8: Re-run the CI-equivalent validation set
  Test to write:
  No new test definitions. This is the final verification slice.
  Code to implement:
  No new implementation unless validation reveals another real blocker; if it does, stop and re-plan before continuing.
  How to verify it works:
  Run the smallest CI-equivalent proof set in order:
  `npx vitest run src/httpServerStructure.spec.ts src/financeAdvancedTools.spec.ts src/duplicateCodeRemediation.spec.ts`
  Then run `npx vitest run`
  Then run `npm run test:coverage`
  Then re-check PR status with `gh pr view 165 --json statusCheckRollup,mergeStateStatus`.

---

# OAuth Single-File Extraction Plan

## Goal

Extract the smallest coherent OAuth runtime into one source file while preserving the current end-to-end behavior:
client registration, authorization start, optional consent, upstream callback handling, local authorization-code exchange, refresh-token exchange, and local access-token verification.

## Assumptions

- Treat "minimal logic required to run it" as preserving the current external HTTP/OAuth behavior while collapsing the internals into one file, not rewriting every surrounding HTTP route into that same file.
- Keep the existing SDK/router integration points unless the extraction proves they are unnecessary.
- Honor the user's formatting request by making the extracted file intentionally comment-heavy, with a comment directly above each non-blank code line describing the current shape or an example value.
- The repo is currently dirty on `fix/tdd-tech-debt-remediation`; if implementation begins, do not switch branches automatically without a quick alignment because repo rules prefer a fresh branch/worktree from `main`.

## Tasks

- [ ] Task 1: Pin the minimal single-file OAuth runtime contract with a failing end-to-end spec
  Test to write:
  Add a focused spec, likely `src/oauthSingleFile.spec.ts`, that drives the smallest full happy path through one extracted module: register client, start authorization, approve consent, handle upstream callback, exchange the local authorization code, refresh the token, and verify the minted local access token.
  Code to implement:
  No production code in this task. Only the new failing spec that defines the minimum behavior the extracted file must preserve.
  How to verify it works:
  Run `npx vitest run src/oauthSingleFile.spec.ts` and show the red failure first.

- [ ] Task 2: Pin the consumability and "one file" constraints with a failing source-shape spec
  Test to write:
  Add a source-inspection spec, likely `src/oauthSingleFileShape.spec.ts`, that fails unless the extraction lives in one dedicated source file, the existing runtime entrypoint delegates into that file, and the extracted file follows the requested comment-first format closely enough to prove each executable line is immediately preceded by an explanatory comment.
  Code to implement:
  No production code in this task. Only the failing guardrail spec for file ownership and consumability.
  How to verify it works:
  Run `npx vitest run src/oauthSingleFileShape.spec.ts` and show the red failure first.

- [ ] Task 3: Implement the minimal single-file OAuth runtime
  Test to write:
  Reuse the failing specs from Tasks 1 and 2.
  Code to implement:
  Create one new OAuth runtime file that inlines only the logic truly required from the current `oauthBroker`, `oauthCore`, `oauthStore`, `upstreamOAuthAdapter`, and `localTokenService` layers, while keeping the surrounding API surface as small as possible.
  How to verify it works:
  Re-run `npx vitest run src/oauthSingleFile.spec.ts src/oauthSingleFileShape.spec.ts` and show them passing.

- [ ] Task 4: Rewire the current entrypoints to the extracted file with the thinnest possible wrappers
  Test to write:
  Add or update the smallest targeted regression spec around the existing public entrypoint, most likely `src/mcpAuthServer.spec.ts` or `src/oauthBroker.spec.ts`, so it fails unless the live OAuth route stack now runs through the extracted single-file implementation.
  Code to implement:
  Replace the old multi-file orchestration with thin wrappers or re-exports that delegate into the new single-file runtime without changing the external HTTP contract.
  How to verify it works:
  Run the focused regression proof for the touched entrypoint plus the new single-file specs and show green.

- [ ] Task 5: Final OAuth verification and review-bar check
  Test to write:
  No new test definitions unless Task 4 exposes a real missing behavior, in which case stop and re-plan before implementing.
  Code to implement:
  No new implementation unless verification reveals a true gap.
  How to verify it works:
  Run the smallest meaningful OAuth slice:
  `npx vitest run src/oauthSingleFile.spec.ts src/oauthSingleFileShape.spec.ts src/mcpAuthServer.spec.ts src/oauthBroker.spec.ts src/localTokenService.spec.ts src/upstreamOAuthAdapter.spec.ts`
  Then inspect the extracted file directly to confirm the comment-above-each-line requirement is actually met and ask whether the result clears a staff-engineer review bar for simplicity and readability.

---

# Responsibility-Named Subsystem Extraction Plan

## Goal

Refactor the bridge into a modular monolith made of explicit, responsibility-named subsystems with narrow function interfaces, while preserving current HTTP, MCP, client-profile, and OAuth behavior.

## Constraints And Notes

- The working tree is already dirty on `fix/tdd-tech-debt-remediation`; execution should avoid disturbing unrelated changes.
- Repo rules prefer implementation from current `main`, but because the current branch is not `main` and already has local changes, branch/worktree alignment needs a pause before execution rather than an automatic switch.
- Markdown-only planning updates do not require TDD; all source-code changes after approval must follow the red -> green -> verify loop one task at a time.
- The user's formatting request applies to each new subsystem file:
  - add a header comment listing ownership, inputs/dependencies, and outputs/contracts
  - add a comment above each non-blank executable line describing the current shape and/or an example value
- Favor coarse, cohesive subsystem files over helper-fragmentation so the result stays a modular monolith, not a grab bag of utility modules.
- Existing mixed files with strong internal coupling should become thin composition wrappers when practical.

## Proposed Subsystem Map

- `server-runtime`
  Owns: top-level MCP server creation, tool metadata definitions, ordered tool registration, and the logging-wrapped registrar loop.
  Inputs/dependencies: validated YNAB config, YNAB API factory/runtime attachment, tool modules, request-context logging helpers, MCP registrar.
  Outputs/contracts: `defineTool(...)`, `registerServerTools(...)`, and `createServer(...)`.
- `http-transport`
  Owns: Express app assembly for MCP HTTP transport, request parsing, request/session validation, JSON-RPC response writers, CORS/origin enforcement, MCP POST handoff, and top-level HTTP error handling.
  Inputs/dependencies: auth config, YNAB config, `server-runtime`, header helpers, request-context helpers, origin-policy helpers, `client-profile-resolution`, and `oauth-runtime`.
  Outputs/contracts: `startHttpServer(...)` plus explicit helper interfaces consumed by route-local wiring.
- `client-profile-resolution`
  Owns: provisional client detection from request shape, persisted OAuth profile fallback, initialize-time reconciliation, and explicit response-local profile updates.
  Inputs/dependencies: request shape, response locals, client-profile detector/catalog/logger, persisted OAuth profile lookups.
  Outputs/contracts: explicit functions or middleware builders for detect/reconcile/apply-persisted-profile flows.
- `oauth-runtime`
  Owns: OpenID/protected-resource metadata, bearer-auth middleware wiring, OAuth HTTP route registration, consent-page handling, provider callbacks, token exchange orchestration, and OAuth event logging.
  Inputs/dependencies: OAuth auth config, `grant-lifecycle`, `grant-persistence`, upstream OAuth adapter, local token service, Cloudflare compatibility middleware, `client-profile-resolution`.
  Outputs/contracts: `createMcpAuthModule(...)`, route-registration functions, consent/callback handlers, provider implementation, issuer accessors, and persisted client-profile lookup.
- `grant-lifecycle`
  Owns: OAuth client validation and all grant state transitions across consent, upstream authorization, authorization-code exchange, and refresh-token exchange.
  Inputs/dependencies: clock/id/token-exchange/mint dependencies and the persistence contract.
  Outputs/contracts: lifecycle methods currently exposed through `createOAuthCore(...)`.
- `grant-persistence`
  Owns: persisted approvals/clients/client-profiles/grants state, legacy migration, pruning, and atomic file persistence.
  Inputs/dependencies: store path plus grant normalization helpers.
  Outputs/contracts: store contract currently consumed by `grant-lifecycle` and the OAuth provider layer.
- Coupling note
  Keep request parsing, session resolution, and MCP transport handoff together inside `http-transport`, and keep consent rendering, metadata, bearer-auth wiring, and provider callbacks together inside `oauth-runtime`, because those pieces form cohesive runtime slices and splitting them further would fight the modular-monolith goal.

## Tasks

- [ ] Task 1: Pin the subsystem map and file-format contract with failing source-shape specs
  Test to write:
  Add a focused source-inspection spec, likely `src/subsystemExtraction.spec.ts`, that fails unless the responsibility-named files exist, each file starts with the requested ownership/input/output header comment, and each extracted executable line is preceded by a comment.
  Code to implement:
  No production code in this task. Only the new failing guardrail spec plus the smallest source-shape assertion updates in existing structure specs where needed.
  How to verify it works:
  Run `npx vitest run src/subsystemExtraction.spec.ts src/httpServerStructure.spec.ts src/serverFactory.spec.ts` and show the red failure first.

- [ ] Task 2: Extract `server-runtime`
  Test to write:
  Extend `src/serverFactory.spec.ts` so it fails unless `src/server.ts` delegates to `src/server-runtime.ts` and the registration order stays intact through that subsystem boundary.
  Code to implement:
  Move tool definitions, annotations, registration helpers, ordered tool registration, and server creation into `src/server-runtime.ts`, then reduce `src/server.ts` to a thin compatibility wrapper around that subsystem.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts` and show the failing assertion first, then the passing suite after the extraction.

- [ ] Task 3: Extract `http-transport`
  Test to write:
  Extend `src/httpServerStructure.spec.ts` so it fails unless `src/httpServer.ts` delegates the HTTP runtime to `src/http-transport.ts`.
  Code to implement:
  Move request parsing, request/session validation, JSON/JSON-RPC response writers, debug-detail helpers, CORS/origin enforcement, MCP POST handoff, and HTTP error handling out of `src/httpServer.ts` into `src/http-transport.ts`, keeping cross-subsystem calls explicit.
  How to verify it works:
  Run `npx vitest run src/httpServerStructure.spec.ts src/httpServer.spec.ts` and show the red failure first, then the passing targeted HTTP proof after the extraction.

- [ ] Task 4: Extract `client-profile-resolution` and keep the profile contract explicit
  Test to write:
  Add or extend focused assertions in `src/clientProfiles.spec.ts` and `src/httpServerStructure.spec.ts` so they fail unless provisional detection, persisted-profile fallback, and initialize reconciliation route through `src/client-profile-resolution.ts`.
  Code to implement:
  Move the profile-resolution helpers currently split across `src/httpServer.ts`, `src/httpServerMcpRoute.ts`, and `src/httpServerOAuthRoutes.ts` into `src/client-profile-resolution.ts`, exposing explicit functions for detect/reconcile/apply-persisted-profile behavior.
  How to verify it works:
  Run `npx vitest run src/clientProfiles.spec.ts src/httpServerStructure.spec.ts src/httpServer.spec.ts` and show the red failure first, then the passing profile-related proof after the extraction.

- [ ] Task 5: Extract `oauth-runtime`
  Test to write:
  Extend `src/mcpAuthServer.spec.ts`, `src/oauthBroker.spec.ts`, and the new source-shape spec so they fail unless OAuth route wiring and provider runtime ownership live in `src/oauth-runtime.ts`.
  Code to implement:
  Move OpenID/protected-resource metadata, auth-router composition, consent rendering/headers, provider callbacks, token debug logging, and broker orchestration into `src/oauth-runtime.ts`, leaving existing OAuth entrypoints as thin wrappers only if needed for compatibility.
  How to verify it works:
  Run `npx vitest run src/mcpAuthServer.spec.ts src/oauthBroker.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing OAuth proof after the extraction.

- [ ] Task 6: Extract `grant-lifecycle` and `grant-persistence`, keeping their boundary explicit
  Test to write:
  Extend `src/oauthCore.spec.ts` and `src/oauthStore.spec.ts` with source-shape assertions so they fail unless lifecycle logic lives in `src/grant-lifecycle.ts` and persistence logic lives in `src/grant-persistence.ts`, with the current public behavior preserved.
  Code to implement:
  Move the core grant-transition logic out of `src/oauthCore.ts` into `src/grant-lifecycle.ts`, move persisted-state load/migrate/prune/write logic out of `src/oauthStore.ts` into `src/grant-persistence.ts`, and leave the old modules as thin compatibility wrappers only if that keeps the refactor safer.
  How to verify it works:
  Run `npx vitest run src/oauthCore.spec.ts src/oauthStore.spec.ts src/oauthBroker.spec.ts` and show the red failure first, then the passing lifecycle/persistence proof after the extraction.

- [ ] Task 7: Final verification and review-bar check
  Test to write:
  No new test definitions unless one of the earlier tasks exposes a real missing contract, in which case stop and re-plan before implementing further.
  Code to implement:
  No new implementation unless verification reveals a true regression.
  How to verify it works:
  Run `npx vitest run src/subsystemExtraction.spec.ts src/serverFactory.spec.ts src/httpServerStructure.spec.ts src/clientProfiles.spec.ts src/httpServer.spec.ts src/mcpAuthServer.spec.ts src/oauthBroker.spec.ts src/oauthCore.spec.ts src/oauthStore.spec.ts`
  Then run `npm test`
Then inspect each extracted subsystem file directly to confirm the header-comment and comment-above-each-line contract is genuinely satisfied and ask whether the result meets a staff-engineer review bar for explicit boundaries and readability.

---

# Active Plan: Modular Monolith TDD Implementation

## Goal

Refactor the bridge into a modular monolith made of explicit, responsibility-named subsystems with narrow function interfaces, while preserving current HTTP, MCP, client-profile, and OAuth behavior.

## Constraints And Notes

- This active plan supersedes the older subsystem-extraction section above for the current implementation run.
- The working tree is already dirty on `fix/tdd-tech-debt-remediation`; execution should avoid disturbing unrelated changes.
- Repo rules prefer implementation from current `main`, but because the current branch is not `main` and already has local changes, branch/worktree alignment needs a pause before execution rather than an automatic switch.
- Markdown-only planning updates do not require TDD; all source-code changes after approval must follow the red -> green -> verify loop one task at a time.
- Each new subsystem file must have a header comment listing ownership, inputs/dependencies, and outputs/contracts. Do not add per-line comments unless the logic is non-obvious.
- Favor coarse, cohesive subsystem files over helper-fragmentation so the result stays a modular monolith, not a grab bag of utility modules.
- During extraction, old files such as `server.ts` and `httpServer.ts` become thin re-export shims. The final task deletes all shims and updates import sites to point directly at the new subsystem files.
- Keep each implementation task small enough to fit the repo's expected 5-15 minute TDD loop.

## Proposed Subsystem Map

- `serverRuntime` (`src/serverRuntime.ts`)
  Owns: top-level MCP server creation, tool metadata definitions, ordered tool registration, and the logging-wrapped registrar loop.
  Inputs/dependencies: validated YNAB config, YNAB API factory/runtime attachment, tool modules, request-context logging helpers, MCP registrar.
  Outputs/contracts: `defineTool(...)`, `registerServerTools(...)`, and `createServer(...)`.

- `httpTransport` (`src/httpTransport.ts`)
  Owns: Express app assembly for MCP HTTP transport, request parsing, request/session validation, JSON-RPC response writers, CORS/origin enforcement, MCP POST handoff, and top-level HTTP error handling.
  Inputs/dependencies: auth config, YNAB config, `serverRuntime`, header helpers, request-context helpers, origin-policy helpers, `clientProfiles/`, and `oauthRuntime`.
  Outputs/contracts: `startHttpServer(...)` plus explicit helper interfaces consumed by route-local wiring.

- `clientProfiles/`
  Owns: provisional client detection from request shape, persisted OAuth profile fallback, initialize-time reconciliation, and explicit response-local profile updates.
  Notes: no extraction needed; keep the existing directory boundary.

- `oauthRuntime` (`src/oauthRuntime.ts`)
  Owns: OpenID/protected-resource metadata, bearer-auth middleware wiring, OAuth HTTP route registration, consent-page handling, provider callbacks, token exchange orchestration, and OAuth event logging.
  Inputs/dependencies: OAuth auth config, `grantLifecycle`, `grantPersistence`, upstream OAuth adapter, local token service, Cloudflare compatibility middleware, `clientProfiles/`.
  Outputs/contracts: `createMcpAuthModule(...)`, route-registration functions, consent/callback handlers, provider implementation, issuer accessors, and persisted client-profile lookup.

- `grantLifecycle` (`src/grantLifecycle.ts`)
  Owns: OAuth client validation and all grant state transitions across consent, upstream authorization, authorization-code exchange, and refresh-token exchange.
  Inputs/dependencies: clock/id/token-exchange/mint dependencies and the persistence contract.
  Outputs/contracts: lifecycle methods currently exposed through `createOAuthCore(...)`.

- `grantPersistence` (`src/grantPersistence.ts`)
  Owns: persisted approvals/clients/client-profiles/grants state, legacy migration, pruning, and atomic file persistence.
  Inputs/dependencies: store path plus grant normalization helpers.
  Outputs/contracts: store contract currently consumed by `grantLifecycle` and the OAuth provider layer.

## Tasks

- [x] Task 1: Pin the modular-monolith boundaries with failing contract specs
  Test to write:
  Add `src/subsystemExtraction.spec.ts` that verifies enforceable runtime contracts only: each new subsystem module exists, can be imported, and exposes the expected named exports. Use source inspection where needed to assert old entrypoints delegate to the new subsystem files, rather than claiming to prove TypeScript signatures at runtime.
  Code to implement:
  No production code in this task. Only contract specs.
  How to verify it works:
  Run `npx vitest run src/subsystemExtraction.spec.ts` and show the red failure first.

- [x] Task 2: Extract `serverRuntime`
  Test to write:
  Extend `src/serverFactory.spec.ts` so it fails unless `src/server.ts` delegates to `src/serverRuntime.ts` and preserves tool registration order.
  Code to implement:
  Move tool definitions, annotations, registration loop, and `createServer(...)` ownership into `src/serverRuntime.ts`, then leave `src/server.ts` as a thin re-export shim.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts` and show the red failure first, then the passing suite.

- [x] Task 3: Pin the `httpTransport` boundary with a failing structure spec
  Test to write:
  Extend `src/httpServerStructure.spec.ts` so it fails unless `src/httpServer.ts` delegates the HTTP runtime to `src/httpTransport.ts`.
  Code to implement:
  No production code in this task. Only the failing boundary spec for `httpTransport`.
  How to verify it works:
  Run `npx vitest run src/httpServerStructure.spec.ts` and show the red failure first.

- [x] Task 4: Extract `httpTransport` while keeping `httpServerMcpRoute.ts` in place
  Test to write:
  Reuse the failing structure spec from Task 3 and add the smallest targeted `src/httpServer.spec.ts` checks needed to prove request parsing, response writers, and top-level HTTP error handling still work through `src/httpTransport.ts`.
  Code to implement:
  Move Express app assembly, request parsing, CORS/origin handling, response writers, and top-level HTTP error handling into `src/httpTransport.ts`, while keeping `src/httpServerMcpRoute.ts` as an explicit dependency for MCP POST handling.
  How to verify it works:
  Run `npx vitest run src/httpServerStructure.spec.ts src/httpServer.spec.ts` and show the red failure first, then the passing suite.

- [x] Task 5: Absorb `httpServerMcpRoute.ts` into `httpTransport`
  Test to write:
  Extend `src/httpServerStructure.spec.ts` and the smallest relevant `src/httpServer.spec.ts` cases so they fail unless MCP POST handoff and session handling now live in `src/httpTransport.ts` rather than `src/httpServerMcpRoute.ts`.
  Code to implement:
  Move MCP POST handoff and session-resolution ownership into `src/httpTransport.ts`, leaving `src/httpServerMcpRoute.ts` as a thin shim.
  How to verify it works:
  Run `npx vitest run src/httpServerStructure.spec.ts src/httpServer.spec.ts` and show the red failure first, then the passing suite.

- [x] Task 6: Pin the `oauthRuntime` boundary with failing structure specs
  Test to write:
  Extend `src/mcpAuthServer.spec.ts`, `src/oauthBroker.spec.ts`, and `src/subsystemExtraction.spec.ts` so they fail unless OAuth route wiring and provider runtime ownership live in `src/oauthRuntime.ts`.
  Code to implement:
  No production code in this task. Only the failing boundary specs for `oauthRuntime`.
  How to verify it works:
  Run `npx vitest run src/mcpAuthServer.spec.ts src/oauthBroker.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first.

- [x] Task 7: Extract `oauthRuntime` while keeping `httpServerOAuthRoutes.ts` in place
  Test to write:
  Reuse the failing specs from Task 6 and add the smallest targeted checks needed to prove metadata, auth middleware wiring, and `createMcpAuthModule(...)` now delegate through `src/oauthRuntime.ts`.
  Code to implement:
  Move OpenID/protected-resource metadata, auth middleware wiring, and broker/module composition into `src/oauthRuntime.ts`, while keeping `src/httpServerOAuthRoutes.ts` as an explicit dependency for OAuth route registration.
  How to verify it works:
  Run `npx vitest run src/mcpAuthServer.spec.ts src/oauthBroker.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing suite.

- [x] Task 8: Absorb `httpServerOAuthRoutes.ts` into `oauthRuntime`
  Test to write:
  Extend the smallest relevant `src/oauthBroker.spec.ts` and structure assertions so they fail unless OAuth route registration, consent handling, callback handling, and token orchestration now live in `src/oauthRuntime.ts`.
  Code to implement:
  Move OAuth route registration, consent rendering, callback handling, token exchange orchestration, and OAuth logging into `src/oauthRuntime.ts`, leaving `src/httpServerOAuthRoutes.ts`, `src/mcpAuthServer.ts`, and `src/oauthBroker.ts` as thin shims.
  How to verify it works:
  Run `npx vitest run src/oauthBroker.spec.ts src/mcpAuthServer.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing suite.

- [x] Task 9: Extract `grantPersistence`
  Test to write:
  Extend `src/oauthStore.spec.ts` and `src/subsystemExtraction.spec.ts` so they fail unless persistence logic lives in `src/grantPersistence.ts`.
  Code to implement:
  Move persisted state load, migration, pruning, and atomic writes into `src/grantPersistence.ts`, leaving `src/oauthStore.ts` as a thin re-export shim.
  How to verify it works:
  Run `npx vitest run src/oauthStore.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing suite.

- [x] Task 10: Extract `grantLifecycle`
  Test to write:
  Extend `src/oauthCore.spec.ts` and `src/subsystemExtraction.spec.ts` so they fail unless lifecycle logic lives in `src/grantLifecycle.ts`.
  Code to implement:
  Move grant state transitions into `src/grantLifecycle.ts`, leaving `src/oauthCore.ts` as a thin re-export shim.
  How to verify it works:
  Run `npx vitest run src/oauthCore.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing suite.

- [x] Task 11: Pin shim removal with a failing cleanup spec
  Test to write:
  Add or extend a source-shape spec so it fails unless production imports no longer target the old shim files (`src/server.ts`, `src/httpServer.ts`, `src/httpServerMcpRoute.ts`, `src/httpServerOAuthRoutes.ts`, `src/mcpAuthServer.ts`, `src/oauthBroker.ts`, `src/oauthCore.ts`, `src/oauthStore.ts`) except where deliberately retained as the final public entrypoints.
  Code to implement:
  No production code in this task. Only the failing cleanup guardrail spec.
  How to verify it works:
  Run `npx vitest run src/subsystemExtraction.spec.ts` and show the red failure first.

- [ ] Task 12: Delete shims and run final verification
  Test to write:
  Reuse the failing cleanup spec from Task 11.
  Code to implement:
  Delete re-export shims and update all import sites across the codebase to point directly at the new subsystem files. Confirm each extracted file has the required header comment.
  How to verify it works:
  Run `npx vitest run src/subsystemExtraction.spec.ts` and show the cleanup spec passing, then run `npm test`, `npm run build`, and grep for any remaining imports of the old module names.

## Results

- Subsystem extraction implementation is complete: `serverRuntime.ts`, `httpTransport.ts`, `oauthRuntime.ts`, `grantPersistence.ts`, and `grantLifecycle.ts` now own the runtime directly, and the transitional shim files were deleted.
- Cleanup verification passed: `npx vitest run src/subsystemExtraction.spec.ts` is green, and a grep for the retired shim import paths returns no matches under `src/`.
- Full-repo verification is still blocked by unrelated existing failures in `src/releasePlease.spec.ts`, `src/pureV4Refactor.spec.ts`, and `src/transactionToolFamily.spec.ts`.
- `npm run build` currently aborts during `tsc` with a Node heap out-of-memory failure in this worktree, so Task 12 remains open until the repo-wide verification blockers are addressed.

---

# Task 12 Completion Plan

## Goal

Close the remaining Task 12 blockers, get the modular-monolith branch to a clean green verification state, and open a PR with the finished changes.

## Constraints And Notes

- The current working tree is dirty on `fix/tdd-tech-debt-remediation`.
- Repo rules prefer implementation on a fresh branch from the latest `main`, but because the current branch is not `main` and contains local changes, branch/worktree alignment needs explicit approval before any implementation work begins.
- Source-code changes must follow the repo's one-task-at-a-time TDD loop after approval: failing test first, minimal implementation second, verification third.
- `tests/` must not be modified.
- Markdown-only planning updates do not require TDD.

## Tasks

- [x] Task 1: Refresh the final tool-layout guardrail
  Test to write:
  Reuse `src/pureV4Refactor.spec.ts` and show the current red failure proving the guardrail still omits `transactionQueryUtils.ts` from the accepted `src/tools` layout.
  Code to implement:
  Apply the minimal spec-only change so the guardrail documents `transactionQueryUtils.ts` as part of the intended final tool surface without weakening the rest of the allowlist.
  How to verify it works:
  Run `npx vitest run src/pureV4Refactor.spec.ts` and show the red failure first, then the passing re-run.

- [x] Task 2: Restore the shared transaction ordering contract
  Test to write:
  Reuse `src/transactionToolFamily.spec.ts` and show the current red failure proving list/search/by-month/by-account/by-category/by-payee do not currently share the same descending date order.
  Code to implement:
  Update the transaction tool implementations to share the same sorted-row helper so the full transaction family exposes one consistent row contract.
  How to verify it works:
  Run `npx vitest run src/transactionToolFamily.spec.ts` and show the red failure first, then the passing re-run plus the smallest meaningful follow-up proof against the touched tools if needed.

- [x] Task 3: Restore the release metadata guardrail
  Test to write:
  Reuse `src/releasePlease.spec.ts` and show the current red failure that the local release metadata trails the highest published tag.
  Code to implement:
  Make the smallest releasable metadata update needed so `package.json`, `.release-please-manifest.json`, changelog/config state, and the published-tag comparison satisfy the current automation contract.
  How to verify it works:
  Run `npx vitest run src/releasePlease.spec.ts` and show the red failure first, then the passing re-run.

- [x] Task 4: Diagnose and fix the build blocker
  Test to write:
  Use the existing build/typecheck commands as the failing proof for this task; if the diagnosis shows a concrete TypeScript regression, add the smallest targeted spec only if necessary and stop to re-plan before broadening scope.
  Code to implement:
  Identify why `npm run build` stalls or exhausts memory in this worktree and apply the smallest safe fix, whether that is a true code/type issue or a config-level compiler-path issue.
  How to verify it works:
  Run `npm run build` and `npm run typecheck` and show both passing.

- [x] Task 5: Final repo verification and PR prep
  Test to write:
  No new tests unless final verification reveals another real contract gap; if it does, stop and re-plan before continuing.
  Code to implement:
  No new implementation unless verification exposes a true regression.
  How to verify it works:
  Run `npx vitest run`, `npm run build`, and grep for retired shim imports.
  Then inspect `git diff --stat` and draft the PR summary/title from the verified changes.

- [x] Task 6: Create the PR
  Test to write:
  No new tests. This is a Git/GitHub workflow step.
  Code to implement:
  Commit the verified changes with a releasable Conventional Commit title, push the branch, and create the PR against `mossipcams/ynab-mcp-bridge`.
  How to verify it works:
  Run `gh pr create` with the final title/body and confirm the PR URL.

## Review

- Verification complete:
  - `npx vitest run`
  - `npm run build`
  - `npm run typecheck`
  - `rg -n 'server\.js|httpServer\.js|httpServerMcpRoute\.js|httpServerOAuthRoutes\.js|mcpAuthServer\.js|oauthBroker\.js|oauthCore\.js|oauthStore\.js' . --glob '!node_modules' --glob '!dist'`
- Result:
  - All 44 Vitest files passed.
  - Build and typecheck both passed with the updated TypeScript invocation and narrower compile-time surface in the extracted runtime modules.
  - No retired shim imports remain outside `dist/`.
  - PR created: `https://github.com/mossipcams/ynab-mcp-bridge/pull/167`

---

# Duplicate Cleanup Plan

## Goal

Clean up the duplicates still left after the modular-monolith extraction by:
- deleting superseded spread-out production modules that the new owner files absorbed
- consolidating the still-active transaction-query duplication
- removing dead tool-definition scaffolding
- proving the cleanup with targeted structure specs, `jscpd`, tests, and build verification

## Scope

- Treat `src/httpTransport.ts`, `src/oauthRuntime.ts`, `src/grantPersistence.ts`, and `src/serverRuntime.ts` as the intended owners.
- Treat duplicate hits against the old spread-out files as cleanup candidates, not as evidence that the monolith extraction itself was wrong.
- If any supposedly dead file still has a live production import discovered during execution, stop and re-plan before deleting it.

## Tasks

- [x] Task 1: Pin the duplicate-cleanup ownership boundary with failing source-shape assertions
  Test to write:
  Update `src/duplicateCodeRemediation.spec.ts` so it fails unless production imports flow through `httpTransport`, `oauthRuntime`, `grantPersistence`, and `serverRuntime`, and unless the old spread-out modules (`httpServerIngress.ts`, `httpServerTransportRoutes.ts`, `httpServerShared.ts`, `oauthStoreMigration.ts`, `oauthCompatibilityGrants.ts`, `oauthGrantViews.ts`, `toolDefinition.ts`) are either unreferenced by production code or explicitly marked as transitional.
  Code to implement:
  No production code in this task. Only the failing guardrail spec that captures the intended owner files and identifies the leftover modules as cleanup targets.
  How to verify it works:
  Run `npx vitest run src/duplicateCodeRemediation.spec.ts` and show the red failure first.

- [x] Task 2: Delete the superseded HTTP spread-out modules
  Test to write:
  Reuse the failing `src/duplicateCodeRemediation.spec.ts` assertions from Task 1 and add the smallest relevant structure check in `src/httpServerStructure.spec.ts` only if needed to prove the live HTTP runtime still routes entirely through `httpTransport.ts`.
  Code to implement:
  Remove `src/httpServerIngress.ts`, `src/httpServerTransportRoutes.ts`, and `src/httpServerShared.ts`, or collapse any required residue into `src/httpTransport.ts` if a last live helper remains there.
  How to verify it works:
  Re-run `npx vitest run src/duplicateCodeRemediation.spec.ts src/httpServerStructure.spec.ts src/httpServer.spec.ts` and show the passing suite.

- [x] Task 3: Delete the superseded OAuth persistence helper modules
  Test to write:
  Reuse the failing ownership assertions from Task 1 and extend the smallest relevant source-shape coverage in `src/oauthStore.spec.ts` or `src/subsystemExtraction.spec.ts` only if needed so it fails unless persistence and compatibility-grant ownership live solely in `grantPersistence.ts`.
  Code to implement:
  Remove `src/oauthStoreMigration.ts`, `src/oauthCompatibilityGrants.ts`, and `src/oauthGrantViews.ts`, inlining or moving any still-needed logic into `src/grantPersistence.ts`.
  How to verify it works:
  Re-run `npx vitest run src/duplicateCodeRemediation.spec.ts src/oauthStore.spec.ts src/subsystemExtraction.spec.ts` and show the passing suite.

- [x] Task 4: Remove dead tool-definition scaffolding
  Test to write:
  Reuse `src/duplicateCodeRemediation.spec.ts` and add the smallest source-shape assertion in `src/serverFactory.spec.ts` only if needed so it fails unless `serverRuntime.ts` is the sole owner of the live tool registrar shape.
  Code to implement:
  Delete `src/toolDefinition.ts` if it is truly dead, or fold its last reusable piece into `src/serverRuntime.ts` and update imports so there is only one live tool-definition owner.
  How to verify it works:
  Re-run `npx vitest run src/duplicateCodeRemediation.spec.ts src/serverFactory.spec.ts` and show the passing suite.

- [x] Task 5: Consolidate the active transaction-query duplication
  Test to write:
  Extend `src/transactionToolFamily.spec.ts` and, if necessary, `src/duplicateCodeRemediation.spec.ts` so they fail unless search/list/query-engine transaction filtering, row projection, and sort behavior share one helper contract rather than repeating logic across `transactionQueryUtils.ts`, `transactionQueryEngine.ts`, `SearchTransactionsTool.ts`, and `transactionToolUtils.ts`.
  Code to implement:
  Move the shared transaction compare/filter/row-building logic into one owner module, update the call sites to consume that shared contract, and delete or slim any now-redundant helper surface.
  How to verify it works:
  Run `npx vitest run src/transactionToolFamily.spec.ts src/duplicateCodeRemediation.spec.ts` and show the red failure first, then the passing suite after the implementation.

- [x] Task 6: Re-run duplicate detection and final verification
  Test to write:
  No new test definitions unless earlier tasks reveal a real contract gap; if they do, stop and re-plan before broadening scope.
  Code to implement:
  No new implementation unless verification finds another true duplicate hotspot worth addressing in this branch.
  How to verify it works:
  Run `npm run lint:duplicates`, then run the focused Vitest suites touched above, then run `npm run build`, and compare the new `jscpd` output with the current baseline so we can confirm the unwanted duplicates were actually removed.

## Discovery Regression Repair Plan

- [x] Task 1: Add a red spec in `src/serverFactory.spec.ts` that fails unless `createServer(...)` advertises MCP `resources` capability and exposes discovery resources for `ynab_list_categories` and `ynab_list_accounts` through the SDK-registered server state.
  Test to write:
  Assert `server.server.getCapabilities()` includes `resources.listChanged`, the registered resource state is non-empty, and the discovery entries include names for `ynab_list_categories` and `ynab_list_accounts`.
  Code to implement:
  Add a resource-registration layer in `src/serverRuntime.ts` alongside tool registration so the server publishes static discovery resources derived from the existing tool definitions.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts` and show the new test failing first, then passing after implementation.

- [x] Task 2: Add a red spec in `src/serverFactory.spec.ts` that fails unless the discovery resource for `ynab_list_categories` and `ynab_list_accounts` can be read and returns tool metadata that points callers back to the callable MCP tool name.
  Test to write:
  Read the registered resource callbacks for those two resources and assert the payload includes the tool name, title, description, and input schema metadata.
  Code to implement:
  Implement deterministic per-tool resource URIs and read callbacks in `src/serverRuntime.ts` that serialize tool metadata into MCP resource contents.
  How to verify it works:
  Re-run `npx vitest run src/serverFactory.spec.ts` and inspect the targeted assertions for those two affected tool resources.

- [x] Task 3: Add a red transport-level spec in `src/httpServer.spec.ts` that fails unless an MCP client can call `listResources()` against the HTTP server and see the `ynab_list_categories` and `ynab_list_accounts` discovery resources.
  Test to write:
  Start the authless HTTP server, connect an MCP client, call `listResources()`, and assert the returned resources include the two affected tool discovery entries.
  Code to implement:
  Wire any missing transport or server initialization needed so the new resource registration is available over the live HTTP path without disturbing `tools/list`.
  How to verify it works:
  Run `npx vitest run src/httpServer.spec.ts src/serverFactory.spec.ts`, then run `npm run build` as the broader proof.

## Post-Deploy Discovery Compatibility Investigation Plan

Validated assumptions before planning:
- The MCP resources spec explicitly allows custom URI schemes and says the standard schemes list is not exhaustive. It also says servers SHOULD use `https://` only when the client can fetch the resource directly from the web, and otherwise SHOULD prefer another scheme or define a custom one. Source: MCP Resources spec, “Common URI Schemes” and “Custom URI Schemes.”
- OpenAI’s ChatGPT developer-mode docs confirm ChatGPT is using full MCP support in developer mode, and that custom apps do not require search/fetch tools. Source: OpenAI Help Center, “Developer mode, and MCP apps in ChatGPT [beta].”
- Deployed bridge logs already prove `resources/list` reaches the server, while `resources/read`, `ynab_list_categories`, `ynab_list_accounts`, and `ynab_search_transactions` do not appear in the same successful ChatGPT retry windows. Treat that as runtime evidence stronger than any local architectural guess.
- Because of the above, `ynab-tool://...` is a compatibility hypothesis to test, not a settled root cause.

Tasks:

- [x] Task 1: Add bridge-side observability that proves what happens after `resources/list`
  Test to write:
  Add a focused spec in `src/httpServer.spec.ts` or `src/serverFactory.spec.ts` that fails unless the server emits structured log events for `resources/list` and `resources/read`, including the advertised resource URIs and the read URI requested by the client.
  Code to implement:
  Add structured MCP logging around resource discovery and reads in the live HTTP/runtime path so production logs can distinguish “resource advertised,” “resource read attempted,” and “resource read missed/not found.”
  How to verify it works:
  Run the targeted Vitest spec first red then green, then manually inspect one local MCP session log to confirm the URI family is visible in logs.

- [x] Task 2: Reproduce the deployed ChatGPT sequence locally with an assertion on the missing follow-up
  Test to write:
  Add a transport-level regression spec in `src/httpServer.spec.ts` that models the observed ChatGPT flow: `initialize` -> `tools/list` -> `resources/list` -> summary `tools/call`, and fails unless the server can distinguish that no `resources/read` occurred during that sequence.
  Code to implement:
  Reuse the new observability hooks to record per-session MCP method flow so we can compare local traces with the deployed logs without relying on manual journal parsing.
  How to verify it works:
  Run the targeted Vitest spec and inspect the emitted trace for the expected sequence.

- [x] Task 3: Run a compatibility experiment with a second resource URI family instead of replacing the current one blindly
  Test to write:
  Add a spec in `src/serverFactory.spec.ts` that fails unless each discovery resource can be exposed under both the current MCP-owned custom URI and a second compatibility URI family, while both variants resolve to identical metadata.
  Code to implement:
  Introduce a compatibility layer in `src/serverRuntime.ts` that can advertise alternate URIs for the same discovery resource without removing the current custom URI path. Keep the current `ynab-tool://...` path intact so we do not regress standards-compliant clients while testing ChatGPT compatibility.
  How to verify it works:
  Run the focused specs, then inspect a local `resources/list` result to confirm both URI families are present and stable.

- [x] Task 4: Only if the alternate URI family is `https://`, make it directly fetchable to stay aligned with the spec
  Test to write:
  Add an HTTP integration spec in `src/httpServer.spec.ts` that fails unless any advertised `https://` discovery URI can be fetched directly over HTTP and returns the same metadata as `resources/read`.
  Code to implement:
  Add a small read-only HTTP endpoint for direct discovery-resource fetches on the public MCP origin, but only if we choose `https://` as the alternate URI family.
  How to verify it works:
  Run the new spec and one manual `curl` against the local server to confirm the direct-fetch contract.

- [x] Task 5: Instrument the `ynab_search_transactions` path separately from discovery
  Test to write:
  Add a targeted spec in `src/httpServer.spec.ts` or a dedicated MCP transport spec that fails unless invalid `ynab_search_transactions` calls produce an explicit MCP validation/error log entry and valid calls emit `tool.call.started`.
  Code to implement:
  Add structured logging at the MCP/transport boundary so production logs can distinguish “client blocked before bridge,” “bridge validation rejected,” and “tool execution started.”
  How to verify it works:
  Run the targeted spec red then green, then replay one local malformed and one valid request and confirm the logs separate the cases cleanly.

- [x] Task 6: Use the new observability in staging or production to decide the actual fix

### Results

- The bridge now logs `resource.list.advertised`, `resource.read.requested`, `resource.read.succeeded`, `resource.read.failed`, `resource.fetch.direct`, and `tool.call.validation_failed`, so deployed retry windows can distinguish post-discovery client behavior from bridge execution gaps.
- Discovery resources now advertise both the original `ynab-tool://...` URI family and an absolute compatibility URL family rooted at `/mcp/resources/...`, with direct HTTP fetch parity tests proving the compatibility URLs resolve to the same metadata as MCP `resources/read`.
- A ChatGPT-style discovery sequence is pinned in `src/httpServer.spec.ts`, proving that `resources/list` can occur without any subsequent `resources/read`, which matches the deployed logs and keeps the client-side hypothesis explicit.
- `ynab_search_transactions` validation failures are now separated from generic dispatch gaps at the HTTP layer, so future runtime logs can prove whether a search request was blocked by MCP argument validation or never executed at all.
  Test to write:
  No new automated test unless Tasks 1-5 reveal a previously unknown bridge contract gap; if they do, stop and re-plan before implementation.
  Code to implement:
  No new code in this task beyond any tiny log-field cleanup found during verification.
  How to verify it works:
  Deploy the instrumented build, capture one ChatGPT retry window, and answer these with evidence: whether ChatGPT ever sends `resources/read`, which URI family it chooses if multiple are advertised, and whether `ynab_search_transactions` ever reaches bridge validation or execution.

## Residual Wrapper Compatibility Plan

Validated assumptions before planning:
- The broad discovery/resource compatibility change materially improved behavior: `ynab_list_categories`, `ynab_get_category`, `ynab_list_accounts`, `ynab_get_account`, and `ynab_search_transactions` are now working in live retries.
- Explorer review and local comparison did not find a unique registration or discovery bug for `ynab_get_month_category`; it is registered through the same generic runtime and compatibility URL path as the now-working sibling tools.
- The remaining flaky tools skew toward stricter invocation contracts or ID-heavy inputs, for example `ynab_get_month_category` requires both `categoryId` and `month`, and `ynab_get_net_worth_trajectory` requires structured month inputs.
- Because of the above, the next change should target wrapper compatibility for strict-input tools, not another broad discovery transport rewrite.

Tasks:

- [x] Task 1: Pin the remaining strict-input discovery contract with failing metadata assertions
  Test to write:
  Add focused assertions in `src/serverFactory.spec.ts` that fail unless discovery documents for `ynab_get_month_category`, `ynab_get_net_worth_trajectory`, and one representative wrapper-blocked tool expose explicit machine-friendly guidance for their required arguments.
  Code to implement:
  Extend the discovery document payload in `src/serverRuntime.ts` with optional compatibility fields such as `requiredArguments`, `argumentExamples`, and `invocationExample`, while keeping the existing metadata contract intact.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts` and inspect the serialized discovery payload for those tools.

- [x] Task 2: Pin the HTTP compatibility route for the enriched discovery payload
  Test to write:
  Extend `src/httpServer.spec.ts` so it fails unless the direct `/mcp/resources/...` compatibility URLs for `ynab_get_month_category` and `ynab_get_net_worth_trajectory` return the enriched guidance fields and still match the MCP `resources/read` payload.
  Code to implement:
  Reuse the shared discovery-document builder in `src/httpTransport.ts` and `src/serverRuntime.ts` so the direct compatibility route and MCP reads stay byte-for-byte aligned for the new fields.
  How to verify it works:
  Run `npx vitest run src/httpServer.spec.ts src/serverFactory.spec.ts` and confirm both transport paths expose the same enriched payload.

- [x] Task 3: Add explicit observability for strict-input tool attempts
  Test to write:
  Add a targeted spec in `src/httpServer.spec.ts` that fails unless attempted calls to `ynab_get_month_category` and `ynab_get_net_worth_trajectory` can be distinguished as one of: resource-read only, validation failure, or actual tool execution start.
  Code to implement:
  Extend the existing HTTP/MCP logging in `src/httpTransport.ts` only as needed so deployed logs can separate “wrapper stopped at discovery” from “bridge received invalid tool arguments” for these tools.
  How to verify it works:
  Run the focused spec red then green, then manually replay one malformed request per tool and confirm the emitted log events are unambiguous.

- [x] Task 4: Keep the tool schemas strict but make the examples concrete
  Test to write:
  Add focused source-shape or serialization assertions in `src/serverFactory.spec.ts` that fail unless the discovery payload for the remaining flaky tools includes concrete valid examples such as `2026-03-01` month strings and representative ID placeholders.
  Code to implement:
  Add explicit example payloads for `ynab_get_month_category`, `ynab_get_net_worth_trajectory`, and optionally one wrapper-blocked ID-heavy tool without weakening their actual Zod schemas.
  How to verify it works:
  Re-run `npx vitest run src/serverFactory.spec.ts` and inspect the enriched examples for exact field names and date formats.

- [x] Task 5: Final verification and deploy-readiness check
  Test to write:
  No new automated test unless earlier tasks reveal a bridge contract bug that requires re-planning.
  Code to implement:
  No new production code beyond any tiny cleanup found during verification.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts src/httpServer.spec.ts`, `npx eslint src/serverRuntime.ts src/httpTransport.ts src/serverFactory.spec.ts src/httpServer.spec.ts --max-warnings=0`, and `npm run build`, then use one deployed retry window to check whether `ynab_get_month_category` and `ynab_get_net_worth_trajectory` now progress beyond the wrapper/resource layer.

## Net Worth Guidance Alignment Plan

Validated assumptions before planning:
- Local bridge proofs now show `ynab_get_net_worth_trajectory` can be read as a resource, can fail validation, and can execute successfully, so the remaining issue is unlikely to be transport registration.
- The strongest remaining bridge-side mismatch is in discovery metadata: `src/serverRuntime.ts` currently marks `fromMonth` as required for `ynab_get_net_worth_trajectory`, while `src/tools/GetNetWorthTrajectoryTool.ts` gives `fromMonth` a default of `"current"` and therefore does not truly require it.
- The smallest and safest next move is to align discovery guidance with the actual schema before changing any validation behavior or transport code.

Tasks:

- [x] Task 1: Pin the schema-to-discovery mismatch with a focused failing spec
  Test to write:
  Add a focused assertion in `src/serverFactory.spec.ts` that fails unless the discovery payload for `ynab_get_net_worth_trajectory` stops overstating `fromMonth` as required while still providing concrete ISO month examples.
  Code to implement:
  No production code in this step beyond whatever minimal change is required after the red proof; the goal is to make the mismatch explicit first.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts -t "aligns net-worth trajectory discovery guidance with the tool schema"` and capture the red failure.

- [x] Task 2: Align discovery guidance with the actual net-worth tool schema
  Test to write:
  Re-run the focused spec from Task 1 and keep it as the guardrail for this behavior.
  Code to implement:
  Update `src/serverRuntime.ts` so `ynab_get_net_worth_trajectory` no longer lists `fromMonth` in `requiredArguments`, while preserving concrete `argumentExamples` and `invocationExample`.
  How to verify it works:
  Re-run the focused spec and inspect the serialized discovery payload for `ynab_get_net_worth_trajectory`.

- [x] Task 3: Final targeted verification on the fresh behavior
  Test to write:
  No new test unless Task 2 reveals another mismatch.
  Code to implement:
  No new production code beyond any tiny cleanup required after Task 2.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts src/httpServer.spec.ts`, `npx eslint src/serverRuntime.ts src/serverFactory.spec.ts --max-warnings=0`, and `npm run build`, then use the next retry window to see whether `ynab_get_net_worth_trajectory` progresses beyond the wrapper/resource layer.
