# Reliable Link Readiness, Catalog Recovery, And Correlation IDs

## Problem Statement

A linked YNAB connector can appear authenticated and reachable while still failing with `Resource not found` for valid MCP tools. That means the system is conflating two different conditions:

- OAuth and token health
- link and tool-catalog readiness

This creates a brittle failure mode:

- the bridge is up
- auth may even refresh successfully
- but the platform cannot resolve `link_id -> callable MCP tool`
- a manual refresh repairs the state

That is not acceptable for production reliability.

## Goals

- Eliminate the need for manual refresh after link creation, token refresh, or connector wake-up.
- Distinguish discovery failures from execution failures.
- Auto-recover from stale catalog state.
- Preserve a last-known-good callable state during refreshes.
- Add end-to-end correlation IDs so incidents can be traced across platform, OAuth, MCP transport, and tool execution.
- Provide enough telemetry to localize failures quickly.

## Non-Goals

- Redesign the MCP bridge tool surface.
- Change tool semantics or YNAB data handling.
- Add aggressive retry loops that hide persistent failures.

## Proposed Model

Treat link readiness as a first-class state machine, separate from OAuth validity.

## Link State Machine

- `link_created`
  Link record exists, but no auth or catalog guarantee yet.
- `auth_valid`
  OAuth credentials are valid enough to call the bridge.
- `catalog_syncing`
  Tool discovery is in progress or being refreshed.
- `ready`
  Catalog has been fetched, validated, and atomically published.
- `degraded`
  Last-known-good catalog exists, but refresh failed or health checks detected inconsistency.
- `broken`
  No valid callable catalog is available and recovery failed.

## State Transitions

- `link_created -> auth_valid`
  Successful auth or link completion.
- `auth_valid -> catalog_syncing`
  Trigger discovery immediately.
- `catalog_syncing -> ready`
  Discovery succeeded and required validation passed.
- `ready -> catalog_syncing`
  Token refresh, connector restart, deploy, schema or version change, or TTL expiry.
- `catalog_syncing -> degraded`
  Refresh failed, but last-known-good catalog still exists.
- `degraded -> ready`
  Later refresh succeeds.
- `degraded -> broken`
  Last-known-good expires or becomes invalid and refresh still fails.
- `broken -> catalog_syncing`
  Manual or automatic recovery attempt begins.

## Best-Practice Catalog Rules

- A link is not callable until it reaches `ready`.
- `auth_valid` alone must never imply `ready`.
- Catalog publication must be atomic.
  Build the new snapshot, validate it, then swap it in.
- Keep last-known-good during refresh.
- Use event-driven invalidation first, TTL second.

## Correlation IDs

Correlation must be first-class, not best-effort. Every externally visible request path should carry a stable identifier that ties together the platform request, link resolution, bridge request, OAuth activity, and tool execution.

### Correlation Fields

- `correlationId`
  Stable identifier for the end-to-end user-visible operation. Reused across platform resolution, `/mcp`, `/token`, and recovery events when they belong to the same flow.
- `causationId`
  Identifier for the immediate parent event. Useful when a `/token` refresh or catalog rehydrate is triggered by a failing `tools/call`.
- `requestId`
  Identifier for the single HTTP request handled by a process. A single `correlationId` may span multiple `requestId` values.
- `linkId`
  The connector link being resolved, when known.
- `catalogVersion`
  The catalog snapshot version used for resolution or execution.
- `refreshAttemptId`
  Identifier for a specific rehydrate or token refresh attempt.

### Correlation Rules

- Accept an upstream `x-correlation-id` when present from the platform, subject to validation.
- If absent, generate a new `correlationId` at the first ingress point.
- Generate a new `requestId` for every HTTP request.
- Preserve `correlationId` across retries, refreshes, and background recovery triggered by the same failing user flow.
- Emit a new `causationId` when a downstream action is triggered from an earlier event.
- Include `correlationId`, `requestId`, and `linkId` in every structured log that participates in MCP dispatch, OAuth refresh, or catalog refresh.
- Return the effective `correlationId` in response headers where appropriate so platform logs can stitch traces back together.

### Correlation Outcomes

With correct propagation, one incident should answer:

- Did the platform resolve the link before the bridge was called?
- Did the bridge receive `/mcp`?
- What JSON-RPC method ran?
- Was a tool dispatch attempted?
- Did a token refresh occur because of the failure?
- Did a catalog rehydrate retry succeed?

## Refresh And Invalidation Rules

Trigger catalog refresh on:

- new link creation
- successful OAuth token refresh
- connector restart or wake-up
- bridge deploy or restart
- tool schema or version change
- explicit admin repair action

Use TTL as a fallback only:

- short enough to correct drift
- long enough to avoid thrash

## Request Handling Rules

When a request targets `link_id/tool_name`:

1. If link state is `ready`
   Attempt normal resolution and execution.
2. If link state is `catalog_syncing`
   Prefer waiting briefly for sync completion if already in flight.
   If not complete within a small bound, return a precise temporary error.
3. If resolution returns `Resource not found` for a known link in `ready` or `degraded`
   Force one catalog rehydrate.
   Retry once.
   If retry succeeds, log recovery and continue.
   If retry fails, return a typed recoverable error.
4. If link state is `broken`
   Return a precise error and schedule background recovery.

All four paths must preserve the original `correlationId`.

## Error Strategy

Replace ambiguous user-visible failures with typed errors:

- `LINK_NOT_READY`
- `CATALOG_REFRESH_IN_PROGRESS`
- `CATALOG_RESOLUTION_FAILED`
- `TOOL_NOT_REGISTERED`
- `TOOL_EXECUTION_FAILED`

`Resource not found` should be internal or diagnostic, not the primary user-facing message.

## Observability Requirements

Every request should be traceable across:

- incoming platform request
- link resolution
- catalog cache hit or miss
- refresh start or finish
- `/mcp` receipt
- JSON-RPC method
- tool dispatch
- tool completion
- `/token` refresh when relevant

Required structured fields:

- `correlationId`
- `causationId` when applicable
- `requestId`
- `linkId`
- `clientId` if available
- `jsonRpcMethod`
- `toolName`
- `catalogVersion`
- `linkState`
- `recoveryAttempted`
- `recoveryResult`

Required events:

- `link.state.changed`
- `catalog.refresh.started`
- `catalog.refresh.succeeded`
- `catalog.refresh.failed`
- `catalog.lookup.hit`
- `catalog.lookup.miss`
- `catalog.rehydrate.retry`
- `tool.call.started`
- `tool.call.succeeded`
- `tool.call.failed`

## Validation Rules For Ready State

Before marking a link `ready`, require:

- bridge reachable
- discovery or tools list succeeded
- expected core tools present
- snapshot stored with version and timestamp
- no partial publication

## Metrics And Alerting

Track:

- successful tool-call rate by link
- time from auth success to `ready`
- percent of calls hitting auto-rehydrate
- auto-rehydrate success rate
- percent of user-visible `LINK_NOT_READY` or `CATALOG_RESOLUTION_FAILED`
- refresh failure rate
- degraded link count
- broken link count

Alert on:

- spike in catalog lookup misses
- degraded or broken links above threshold
- time-to-ready regression
- manual refresh becoming necessary at nontrivial frequency
- token refresh success without subsequent catalog readiness
- missing or malformed correlation IDs on critical events

## Rollout Plan

1. Add observability, request IDs, and correlation IDs.
2. Gate callable status on `ready`.
3. Add forced rehydrate plus one retry on stale resolution failures.
4. Make catalog publication atomic with last-known-good fallback.
5. Add event-driven refresh triggers.
6. Tune TTL and alert thresholds from real traffic.

## Success Criteria

- Manual refresh is no longer required for normal recovery.
- Token refresh and readiness are independently visible.
- Failures localize clearly to resolution, discovery, or execution.
- Stale catalog incidents self-heal on first retry in most cases.
- No half-published tool namespaces are user-visible.
- A single correlation ID can reconstruct the full request path for any incident.
