# Profile-Tied Detection Plan

## Goal

Refactor bridge client detection so profile resolution is driven by the profile definitions themselves instead of hardcoded checks in `detectClient.ts`, while preserving the current debug signal and server behavior.

## Task 1: Route pre-auth detection through profile matchers with explicit reasons and precedence

- What test to write
  - Add focused coverage in `src/clientProfiles.spec.ts` that proves `detectClientProfile` resolves Claude and Codex through the profile matchers instead of duplicated inline request checks.
  - Add an overlap case that locks in profile precedence when more than one matcher could claim a request.
  - Keep the fallback assertion that unknown traffic still resolves to `generic`.
- What code to implement
  - Update the client profile registry so detection can iterate known non-generic profiles in a stable, documented order.
  - Extend the profile-driven detection path so each matched profile can emit the same detection reason detail currently logged, such as `origin:claude.ai` and `path:codex-oauth-probe`.
  - Move the existing Claude-origin and Codex-discovery conditions into the corresponding profile definitions.
- How to verify it works
  - Run `npx vitest run src/clientProfiles.spec.ts` and confirm the new assertions fail before the refactor and pass after it.

## Task 2: Route initialize-time detection through profile matchers without losing reconciliation safety

- What test to write
  - Extend `src/clientProfiles.spec.ts` with assertions that `detectInitializeClientProfile` recognizes profile-specific `clientInfo` values by using `matchesInitialize`.
  - Keep the disagreement and reconciliation coverage intact so mismatched pre-auth and initialize classifications still collapse safely to `generic`.
- What code to implement
  - Refactor `detectInitializeClientProfile` to iterate the same profile registry and defer matching to each profile’s `matchesInitialize` hook.
  - Preserve the existing initialize detection reason and safe `undefined` fallback when no profile claims the request.
- How to verify it works
  - Run `npx vitest run src/clientProfiles.spec.ts` and confirm the initialize and reconciliation assertions fail first if needed, then pass after implementation.

## Task 3: Preserve HTTP lifecycle behavior that depends on pre-auth profile detection

- What test to write
  - Add or update a focused case in `src/httpServer.spec.ts` asserting the logged `profile.detected` result still reflects the expected profile when request detection is profile-driven.
  - Add a focused Codex OAuth discovery probe case that proves the pre-auth resolved profile still triggers canonical discovery-path rewriting.
  - Keep the existing unauthenticated OAuth `POST /mcp` rejection behavior covered so the refactor does not accidentally change auth gating.
- What code to implement
  - Update any server-level detection plumbing needed to consume the refactored profile lookup without changing unrelated auth or transport behavior.
  - Keep the canonical discovery-path logic working with the refactored profile resolution.
- How to verify it works
  - Run the focused HTTP server specs covering profile logging, Codex discovery-path handling, and unauthenticated OAuth MCP rejection.
  - Re-run `npx vitest run src/clientProfiles.spec.ts src/httpServer.spec.ts` if the focused tests surface adjacent lifecycle regressions.

## Task 4: Update checked-in generated output if required

- What test to write
  - No new test; rely on the existing source-level tests and artifact parity expectations.
- What code to implement
  - Regenerate checked-in `dist/` output only if the repository expects source and built artifacts to stay aligned for these files.
- How to verify it works
  - Run the relevant build command and inspect the diff to confirm only expected generated changes are included.
