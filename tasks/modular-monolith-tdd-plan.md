# Modular Monolith TDD Plan

## Goal

Refactor the bridge into a modular monolith made of explicit, responsibility-named subsystems with narrow function interfaces, while preserving current HTTP, MCP, client-profile, and OAuth behavior.

## Constraints And Notes

- The working tree is already dirty on `fix/tdd-tech-debt-remediation`; execution should avoid disturbing unrelated changes.
- Repo rules prefer implementation from current `main`, but because the current branch is not `main` and already has local changes, branch/worktree alignment needs a pause before execution rather than an automatic switch.
- Markdown-only planning updates do not require TDD; all source-code changes after approval must follow the red -> green -> verify loop one task at a time.
- Each new subsystem file must have a header comment listing ownership, inputs/dependencies, and outputs/contracts. Do not add per-line comments unless the logic is non-obvious.
- Favor coarse, cohesive subsystem files over helper-fragmentation so the result stays a modular monolith, not a grab bag of utility modules.
- During extraction, old files (e.g. `server.ts`, `httpServer.ts`) become thin re-export shims. The final task deletes all shims and updates import sites to point directly at the new subsystem files.
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

- `clientProfiles/` (keep existing directory — already well-organized)
  Owns: provisional client detection from request shape, persisted OAuth profile fallback, initialize-time reconciliation, and explicit response-local profile updates.
  No extraction needed. The `src/clientProfiles/` directory with `index.ts`, `detectClient.ts`, `profileContext.ts`, etc. is already a clean module boundary.

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

## Coupling Notes

- Keep request parsing, session resolution, and MCP transport handoff together inside `httpTransport`, because they form one cohesive runtime slice and splitting them further would fight the modular-monolith goal.
- Keep metadata, bearer auth, consent rendering, and provider callbacks together inside `oauthRuntime`, because they form one cohesive OAuth runtime slice and do not split cleanly.
- Leave `src/clientProfiles/` as-is — it is already a well-structured module directory and collapsing it into a single file would be a regression.
- `src/httpServerMcpRoute.ts` (`installMcpPostRoute`) gets absorbed into `httpTransport`. `src/httpServerOAuthRoutes.ts` (`installOAuthRoutes`) gets absorbed into `oauthRuntime`. Both original files become shims deleted in the final task.

## Tasks

- [ ] Task 1: Pin the modular-monolith boundaries with failing contract specs
  Test to write:
  Add `src/subsystemExtraction.spec.ts` that verifies enforceable runtime contracts only: each new subsystem module exists, can be imported, and exposes the expected named exports. Use source inspection where needed to assert old entrypoints delegate to the new subsystem files, rather than claiming to prove TypeScript signatures at runtime.
  Code to implement:
  No production code in this task. Only contract specs.
  How to verify it works:
  Run `npx vitest run src/subsystemExtraction.spec.ts` and show the red failure first.

- [ ] Task 2: Extract `serverRuntime`
  Test to write:
  Extend `src/serverFactory.spec.ts` so it fails unless `src/server.ts` delegates to `src/serverRuntime.ts` and preserves tool registration order.
  Code to implement:
  Move tool definitions, annotations, registration loop, and `createServer(...)` ownership into `src/serverRuntime.ts`, then leave `src/server.ts` as a thin re-export shim.
  How to verify it works:
  Run `npx vitest run src/serverFactory.spec.ts` and show the red failure first, then the passing suite.

- [ ] Task 3: Pin the `httpTransport` boundary with a failing structure spec
  Test to write:
  Extend `src/httpServerStructure.spec.ts` so it fails unless `src/httpServer.ts` delegates the HTTP runtime to `src/httpTransport.ts`.
  Code to implement:
  No production code in this task. Only the failing boundary spec for `httpTransport`.
  How to verify it works:
  Run `npx vitest run src/httpServerStructure.spec.ts` and show the red failure first.

- [ ] Task 4: Extract `httpTransport` while keeping `httpServerMcpRoute.ts` in place
  Test to write:
  Reuse the failing structure spec from Task 3 and add the smallest targeted `src/httpServer.spec.ts` checks needed to prove request parsing, response writers, and top-level HTTP error handling still work through `src/httpTransport.ts`.
  Code to implement:
  Move Express app assembly, request parsing, CORS/origin handling, response writers, and top-level HTTP error handling into `src/httpTransport.ts`, while keeping `src/httpServerMcpRoute.ts` as an explicit dependency for MCP POST handling.
  How to verify it works:
  Run `npx vitest run src/httpServerStructure.spec.ts src/httpServer.spec.ts` and show the red failure first, then the passing suite.

- [ ] Task 5: Absorb `httpServerMcpRoute.ts` into `httpTransport`
  Test to write:
  Extend `src/httpServerStructure.spec.ts` and the smallest relevant `src/httpServer.spec.ts` cases so they fail unless MCP POST handoff and session handling now live in `src/httpTransport.ts` rather than `src/httpServerMcpRoute.ts`.
  Code to implement:
  Move MCP POST handoff and session-resolution ownership into `src/httpTransport.ts`, leaving `src/httpServerMcpRoute.ts` as a thin shim.
  How to verify it works:
  Run `npx vitest run src/httpServerStructure.spec.ts src/httpServer.spec.ts` and show the red failure first, then the passing suite.

- [ ] Task 6: Pin the `oauthRuntime` boundary with failing structure specs
  Test to write:
  Extend `src/mcpAuthServer.spec.ts`, `src/oauthBroker.spec.ts`, and `src/subsystemExtraction.spec.ts` so they fail unless OAuth route wiring and provider runtime ownership live in `src/oauthRuntime.ts`.
  Code to implement:
  No production code in this task. Only the failing boundary specs for `oauthRuntime`.
  How to verify it works:
  Run `npx vitest run src/mcpAuthServer.spec.ts src/oauthBroker.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first.

- [ ] Task 7: Extract `oauthRuntime` while keeping `httpServerOAuthRoutes.ts` in place
  Test to write:
  Reuse the failing specs from Task 6 and add the smallest targeted checks needed to prove metadata, auth middleware wiring, and `createMcpAuthModule(...)` now delegate through `src/oauthRuntime.ts`.
  Code to implement:
  Move OpenID/protected-resource metadata, auth middleware wiring, and broker/module composition into `src/oauthRuntime.ts`, while keeping `src/httpServerOAuthRoutes.ts` as an explicit dependency for OAuth route registration.
  How to verify it works:
  Run `npx vitest run src/mcpAuthServer.spec.ts src/oauthBroker.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing suite.

- [ ] Task 8: Absorb `httpServerOAuthRoutes.ts` into `oauthRuntime`
  Test to write:
  Extend the smallest relevant `src/oauthBroker.spec.ts` and structure assertions so they fail unless OAuth route registration, consent handling, callback handling, and token orchestration now live in `src/oauthRuntime.ts`.
  Code to implement:
  Move OAuth route registration, consent rendering, callback handling, token exchange orchestration, and OAuth logging into `src/oauthRuntime.ts`, leaving `src/httpServerOAuthRoutes.ts`, `src/mcpAuthServer.ts`, and `src/oauthBroker.ts` as thin shims.
  How to verify it works:
  Run `npx vitest run src/oauthBroker.spec.ts src/mcpAuthServer.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing suite.

- [ ] Task 9: Extract `grantPersistence`
  Test to write:
  Extend `src/oauthStore.spec.ts` and `src/subsystemExtraction.spec.ts` so they fail unless persistence logic lives in `src/grantPersistence.ts`.
  Code to implement:
  Move persisted state load, migration, pruning, and atomic writes into `src/grantPersistence.ts`, leaving `src/oauthStore.ts` as a thin re-export shim.
  How to verify it works:
  Run `npx vitest run src/oauthStore.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing suite.

- [ ] Task 10: Extract `grantLifecycle`
  Test to write:
  Extend `src/oauthCore.spec.ts` and `src/subsystemExtraction.spec.ts` so they fail unless lifecycle logic lives in `src/grantLifecycle.ts`.
  Code to implement:
  Move grant state transitions into `src/grantLifecycle.ts`, leaving `src/oauthCore.ts` as a thin re-export shim.
  How to verify it works:
  Run `npx vitest run src/oauthCore.spec.ts src/oauthBroker.spec.ts src/subsystemExtraction.spec.ts` and show the red failure first, then the passing suite.

- [ ] Task 11: Pin shim removal with a failing cleanup spec
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
  - Delete re-export shims (`server.ts` → direct imports from `serverRuntime.ts`, etc.) and update all import sites across the codebase.
  - Confirm each extracted file has the required header comment (ownership, inputs, outputs).
  How to verify it works:
  - Run `npx vitest run src/subsystemExtraction.spec.ts` and show the cleanup spec passing.
  - Run `npm test` — full suite must pass.
  - Run `npm run build` — clean compile with no stale imports.
  - Grep for any remaining imports of the old module names to confirm none survive.

## Execution Order

1. Write the failing contract specs.
2. Extract `serverRuntime`.
3. Pin the `httpTransport` boundary.
4. Extract `httpTransport` while keeping `httpServerMcpRoute.ts`.
5. Absorb `httpServerMcpRoute.ts`.
6. Pin the `oauthRuntime` boundary.
7. Extract `oauthRuntime` while keeping `httpServerOAuthRoutes.ts`.
8. Absorb `httpServerOAuthRoutes.ts`.
9. Extract `grantPersistence`.
10. Extract `grantLifecycle`.
11. Pin shim removal with a failing cleanup spec.
12. Delete shims and run final verification.
