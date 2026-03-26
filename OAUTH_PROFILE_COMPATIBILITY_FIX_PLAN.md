# OAuth Profile Compatibility Fix Plan

Goal: keep the existing OAuth endpoint surface intact while making client-profile detection less dependent on a single discovery endpoint, so OAuth-flow requests for supported clients resolve to the intended profile more consistently.

Notes:
- The repo is currently on `fix/cors-cf-utility-dedup`, not `main`. If implementation proceeds, branch handling needs an explicit check-in before switching because `AGENTS.md` says not to switch automatically from a non-`main` branch.
- This plan assumes we will not change the OAuth routes themselves unless a test proves a route-compatibility gap. The first pass is detection and verification only.

## Task 1: Add a profile-by-profile OAuth endpoint matrix to tests

- What test to write:
  - Extend `src/clientProfiles.spec.ts` with focused fixtures that document the current expected pre-auth signals for `generic`, `claude`, `chatgpt`, and `codex`.
  - Cover the OAuth route family we care about:
    - `/.well-known/oauth-protected-resource`
    - `/.well-known/openid-configuration`
    - `/.well-known/oauth-authorization-server`
    - `/.well-known/oauth-authorization-server/sse`
    - `/sse/.well-known/oauth-authorization-server`
    - `/authorize`
    - `/oauth/callback`
    - `/token`
  - Include at least one failing case for a ChatGPT-style OAuth request and one failing case for a Codex-style OAuth request that currently fall back to `generic`.
- What code to implement:
  - No behavior change yet unless needed to support clearer test fixtures.
  - If useful, add small test helpers in `src/clientProfiles.spec.ts` to keep the matrix readable.
- How to verify it works:
  - Run `npm test -- src/clientProfiles.spec.ts`
  - Confirm the new OAuth-flow fixtures fail before the implementation change and clearly show which requests still resolve to `generic`.

## Task 2: Expand request-level profile detection for OAuth-flow requests

- What test to write:
  - Keep the Task 1 failing fixtures and add any missing focused cases needed to prove the matcher now detects supported clients on OAuth endpoints beyond the initial discovery probe.
  - Preserve precedence coverage so stronger Claude signals still beat ChatGPT or Codex heuristics.
- What code to implement:
  - Update the request-context/profile matcher layer in `src/clientProfiles/` so pre-auth detection can use safe request signals already available on OAuth routes, not just one endpoint path.
  - Keep detection conservative:
    - only promote when the signal is specific enough
    - otherwise retain `generic`
  - Preserve explicit detection reasons for logs.
- How to verify it works:
  - Run `npm test -- src/clientProfiles.spec.ts`
  - Confirm the failing ChatGPT/Codex OAuth fixtures now pass and unrelated OAuth requests still resolve to `generic`.

## Task 3: Prove the HTTP OAuth routes log the intended profile through the flow

- What test to write:
  - Extend `src/httpServer.spec.ts` with end-to-end OAuth scenarios that exercise the route family relevant to supported clients.
  - Assert `profile.detected` logs the intended profile on the key OAuth endpoints in the flow instead of `fallback:generic`.
  - Keep assertions that the OAuth flow itself still succeeds.
- What code to implement:
  - Wire any small supporting plumbing needed so the HTTP middleware keeps the improved request-level detection through OAuth route handling.
  - Do not change the current endpoint surface or canonical rewrite behavior unless a failing test requires it.
- How to verify it works:
  - Run `npm test -- src/httpServer.spec.ts`
  - Confirm the target OAuth routes log the intended profile and the auth flow still works.

## Task 4: Regression sweep for compatibility and build stability

- What test to write:
  - No new feature test unless a gap appears during implementation.
- What code to implement:
  - Minimal cleanup only if required by the earlier tasks.
- How to verify it works:
  - Run `npm test -- src/clientProfiles.spec.ts src/httpServer.spec.ts`
  - Run `npm run build`
  - If the targeted run is clean, run `npm test`

## Expected Outcome

- A concrete, test-backed matrix of which OAuth endpoints and request signals map to each client profile.
- Less brittle OAuth-flow profile detection for supported clients.
- No intentional change to the existing OAuth route surface unless tests prove one is necessary.
