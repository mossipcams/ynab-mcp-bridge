# Architecture

`ynab-mcp-bridge` is a modular monolith: one deployable Node service with explicit internal boundaries instead of separate packages.

## Runtime Flow

1. `src/index.ts` parses CLI args and environment through `src/config.ts`.
2. Config resolution chooses either HTTP transport or stdio transport.
3. `src/httpTransport.ts` assembles the Express app, origin/auth enforcement, MCP POST handling, and auth2 HTTP route wiring.
4. `src/stdioServer.ts` starts the local stdio transport path.
5. `src/serverRuntime.ts` builds the MCP server, registers tools, and exposes discovery resources.
6. Feature slice tool modules call shared-kernel helpers to serve read-only responses.

## Layer Model

- Entry: `src/index.ts`
- Transport: `src/httpTransport.ts`, `src/stdioServer.ts`, `src/auth2/http/routes.ts`
- Composition: `src/serverRuntime.ts`
- Domain and shared kernel: everything else under `src/` except tests

These boundaries are enforced in `.dependency-cruiser.js`. Domain modules must not import transport, composition, or entry modules.

## Vertical Slice Model

The MCP domain may be organized into Vertical Slice modules under `src/features/` while keeping the existing outer shell unchanged.

- `src/features/**`: canonical feature-local MCP domain slices such as transactions, plans, payees, and financial health
- root-level shared kernel modules under `src/`: canonical shared domain helpers used across multiple slices
- `src/tools/**`: compatibility-only re-export shims for legacy imports; not a home for new production logic

Vertical Slice modules are still domain modules. They must not import entry, transport, or composition modules, and they must not bypass the frozen `auth2` seams.

## Auth2 Subsystem

The active OAuth implementation is the `auth2` tree, not the retired `oauthRuntime` path.

- `src/auth2/config/schema.ts`: canonical auth2 config parsing and startup-log shaping
- `src/auth2/http/routes.ts`: OAuth and authorization-server endpoints exposed by the bridge
- `src/auth2/core/authCore.ts`: authorization, callback, code exchange, and refresh flow logic
- `src/auth2/provider/providerAdapter.ts`: upstream IdP HTTP exchanges and response normalization
- `src/auth2/store/authStore.ts`: persistence for clients, transactions, grants, codes, and tokens; local token/code lookups are opaque and upstream token material is sealed before persistence
- `src/auth2/logging/*`: auth-scoped logging and event helpers
- `src/auth2/harness/*`: local test and e2e scaffolding, not production runtime surface

Auth2 may depend on shared kernel modules such as `src/config.ts`, `src/logger.ts`, `src/requestContext.ts`, `src/typeUtils.ts`, and `src/authAdmissionPolicy.ts`, but new OAuth work should enter through existing auth2 seams before adding more root-level coupling.

## MCP Runtime

- `src/httpTransport.ts`: HTTP app assembly, request validation, and MCP transport handoff
- `src/serverRuntime.ts`: server creation, tool registry, discovery resources, and metadata
- `src/features/**`: canonical home for grouped MCP capabilities and their nearby helpers
- `src/*.ts` shared-kernel helpers such as `cachedYnabReads.ts`, `collectionToolUtils.ts`, `financeToolUtils.ts`, and `planToolUtils.ts`
- `src/tools/*.ts`: compatibility-only shims that re-export canonical feature or shared-kernel modules
- `src/transactionQueryEngine.ts`, `src/ynabApi.ts`: shared read/query logic and compatibility seams
- `src/clientProfiles/*` and `src/requestContext.ts`: client detection and request-scoped metadata

All MCP POST traffic now uses the managed MCP transport handoff path after transport-level auth and origin checks succeed. Bootstrap metadata and `tools/call` requests share the same HTTP execution path.

## Contributor Rules

- Keep transport concerns in transport modules. Do not move request parsing, origin handling, or auth route wiring into tool modules.
- Keep `src/serverRuntime.ts` as registry and discovery glue. Tool-specific branching belongs in feature slices or shared helpers.
- Prefer new MCP capability work under `src/features/` when it naturally belongs to a single slice; keep only genuinely shared helpers at the `src/` root.
- Treat `src/tools/**` as compatibility-only. Do not add new production logic there.
- Read environment and CLI flags only in bootstrap/config modules.
- Treat auth2 as the canonical OAuth path. Do not revive retired `oauthRuntime`-style modules.
- Review this `architecture.md` before starting implementation work so new changes follow the current seams.
- OAuth and auth2 behavior is currently considered stable. Do not change OAuth/auth2 code unless the user explicitly asks for that work.
