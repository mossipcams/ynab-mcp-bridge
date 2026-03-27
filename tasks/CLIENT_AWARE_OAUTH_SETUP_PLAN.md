# Client-Aware OAuth Setup Plan

Goal: add a client-aware OAuth/setup profile layer to `ynab-mcp-bridge` without changing tool logic, so the bridge can adapt setup behavior for Claude, Codex, and a safe generic fallback.

## Task 1: Define profile types and defaults

- Test to write:
  - Add a spec in `src/` that asserts a `generic` profile exists, has safe default flags, and exposes the expected shape for OAuth/setup behavior.
- Code to implement:
  - Create `src/clientProfiles/types.ts`
  - Create `src/clientProfiles/genericProfile.ts`
  - Create `src/clientProfiles/index.ts`
- How to verify it works:
  - Run the new spec and confirm the generic profile shape is stable and importable.

## Task 2: Add client detection for pre-auth setup

- Test to write:
  - Add a spec covering provisional detection from request context:
    - Claude-like origin/header/path resolves to `claude`
    - Codex-like discovery/path pattern resolves to `codex`
    - unknown request resolves to `generic`
- Code to implement:
  - Create `src/clientProfiles/detectClient.ts`
  - Add a small request-context type and matching logic based on headers, origin, and path only
- How to verify it works:
  - Run the new detection spec and confirm each fixture maps to the expected profile.

## Task 3: Add request-scoped profile context and logging

- Test to write:
  - Add a spec proving a detected profile can be attached to request lifecycle context and logged with a reason.
- Code to implement:
  - Create `src/clientProfiles/profileContext.ts`
  - Create `src/clientProfiles/profileLogger.ts`
  - Keep this as a small utility layer with no behavior changes yet
- How to verify it works:
  - Run the new spec and confirm profile id plus detection reason are preserved.

## Task 4: Integrate profiles into HTTP setup flow

- Test to write:
  - Extend HTTP server specs to assert:
    - the server resolves a provisional client profile before `/mcp` handling
    - session/json/stateless behavior still works for generic clients
    - Claude/Codex profile selection does not break existing POST-only flow
- Code to implement:
  - Wire profile detection into `src/httpServer.ts`
  - Attach selected profile to the request context
  - Log selected profile and reason
- How to verify it works:
  - Run the relevant HTTP specs and confirm no regressions in current stateless behavior.

## Task 5: Integrate profiles into OAuth discovery and auth routes

- Test to write:
  - Add or extend auth specs to cover profile-aware behavior on discovery, registration, authorize, and token endpoints.
  - Focus on tolerated setup differences, not tool execution.
- Code to implement:
  - Wire the profile context into `src/mcpAuthServer.ts`
  - Add profile-aware hooks in `src/oauthBroker.ts`
  - Start with small flags only:
    - accepted discovery path variants
    - token request leniency level
    - tolerated extra discovery probes
- How to verify it works:
  - Run the OAuth-related specs and confirm existing brokered OAuth behavior still passes while profile hooks are exercised.

## Task 6: Add initial `claude` and `codex` profiles

- Test to write:
  - Add specs asserting each profile overrides only the intended setup flags and falls back safely to generic defaults.
- Code to implement:
  - Create `src/clientProfiles/claudeProfile.ts`
  - Create `src/clientProfiles/codexProfile.ts`
  - Register both in `src/clientProfiles/index.ts`
- How to verify it works:
  - Run the new profile specs and confirm both profiles resolve and expose the expected OAuth/setup behavior.

## Task 7: Confirm post-auth/profile reconciliation path

- Test to write:
  - Add a spec for reconciling pre-auth guessed profile with later confirmed `initialize` metadata when available.
  - If they differ, assert the system keeps the safer behavior and logs the mismatch.
- Code to implement:
  - Extend detection/types to support a second-phase confirmation from `clientInfo` and `capabilities`
  - Keep this lightweight and non-invasive to tool registration
- How to verify it works:
  - Run reconciliation specs and ensure mismatches do not weaken auth/setup behavior.

## Task 8: Final verification sweep

- Test to write:
  - No new feature test here unless a gap appears during implementation.
- Code to implement:
  - Small cleanup only if needed from earlier tasks
- How to verify it works:
  - Run targeted specs for new profile logic
  - Run `npm test`
  - Run `npm run build`

## Assumptions

- New tests will live under `src/*.spec.ts`, not the `tests/` directory.
- First pass will add profile infrastructure and a few setup flags, not a full per-client rewrite.
