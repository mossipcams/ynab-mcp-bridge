# Offline Access Refresh Fix Plan

## Goal

Align the bridge's OAuth behavior with ChatGPT MCP expectations for durable refresh support by:

- advertising refresh-capable OAuth scopes in discovery metadata
- requesting `offline_access` upstream when the bridge performs OAuth authorization
- surfacing a safe upstream token error summary when refresh exchanges fail

## Branch Note

Current branch is `fix/offline-access-refresh`, created from the latest `main` in a separate worktree.

## Task 1: Lock in `offline_access` as an effective OAuth scope

- What test to write
  - Extend config/runtime coverage to prove OAuth scope handling includes `offline_access` when it is not explicitly configured.
  - Add a spec showing a manually configured `offline_access` value is not duplicated.
- What code to implement
  - Add a small scope-normalization helper so OAuth runtime config consistently includes `offline_access` in the effective scope set.
  - Keep scope ordering stable and deduplicated.
- How to verify it works
  - Run the focused config/runtime scope tests and confirm they fail before the helper exists and pass after implementation.

## Task 2: Advertise and request refresh-capable scopes in the OAuth flow

- What test to write
  - Extend HTTP auth metadata specs to assert `offline_access` appears in `scopes_supported` for `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`.
  - Extend the authorization redirect flow to assert the upstream `/authorize` redirect includes `offline_access` in the `scope` parameter.
  - Extend the upstream adapter unit test to confirm the built upstream authorization URL carries `offline_access`.
- What code to implement
  - Wire the normalized effective scopes into discovery metadata and upstream authorization URL generation.
  - Keep the rest of the OAuth redirect/token behavior unchanged.
- How to verify it works
  - Run the focused HTTP and upstream adapter specs and confirm they fail first and then pass.

## Task 3: Add safe upstream refresh failure diagnostics

- What test to write
  - Add a unit or focused integration test proving a failed upstream refresh includes a safe summary of the upstream error response body in the logged error details without logging token values.
- What code to implement
  - Extend `src/upstreamOAuthAdapter.ts` with a small redaction helper for token-endpoint error bodies.
  - Surface that safe summary through the existing refresh failure log path.
- How to verify it works
  - Run the focused refresh-failure spec before and after implementation.
  - Confirm the resulting log contains actionable upstream error context while still excluding raw token material.

## Task 4: Focused verification sweep

- What test to write
  - No new test unless a gap appears during implementation.
- What code to implement
  - Cleanup only if needed from Tasks 1-3.
- How to verify it works
  - Run the affected focused suites.
  - Run `npm run build`.
  - If the branch stays isolated and green, optionally rerun `npm test` to check for unrelated regressions.

## Chosen Approach

The best code-side fix is to make `offline_access` part of the bridge's effective OAuth scope set and discovery metadata, while separately improving refresh failure diagnostics. That directly targets the ChatGPT-side refresh expectations we observed without changing the core local token model.
