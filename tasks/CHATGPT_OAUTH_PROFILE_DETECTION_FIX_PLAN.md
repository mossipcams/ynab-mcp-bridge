# ChatGPT OAuth Profile Detection Fix Plan

Goal: restore ChatGPT profile detection across the brokered OAuth flow so requests like `/authorize`, `/oauth/callback`, `/token`, and `/.well-known/openid-configuration` stop falling through to `fallback:generic` when the request carries ChatGPT-specific signals.

Notes:
- The current bug is reproducible from code inspection: `src/clientProfiles/chatgptProfile.ts` only matches `/.well-known/oauth-protected-resource`, so the OAuth endpoints in the reported logs can never resolve to `chatgpt` during pre-auth detection.
- The repo is currently on `fix/cors-cf-utility-dedup`, not `main`. If implementation proceeds, branch handling needs an explicit check-in before switching because `AGENTS.md` says not to switch automatically from a non-`main` branch.

## Task 1: Extend request-level ChatGPT detection to cover OAuth flow signals

- Test to write:
  - Add focused cases in `src/clientProfiles.spec.ts` that currently fail and prove `detectClientProfile(...)` resolves `chatgpt` for OAuth-flow requests when they carry ChatGPT-specific signals instead of only the protected-resource probe path.
  - Cover at least:
    - `GET /.well-known/openid-configuration`
    - `GET /authorize`
    - `GET /oauth/callback`
    - `POST /token`
  - Keep one fallback case that proves unrelated OAuth requests still resolve to `generic`.
- Code to implement:
  - Update the client-profile request context and ChatGPT matcher so pre-auth detection can use the safe request signal(s) that are actually present on those OAuth routes.
  - Keep the detection precedence intact so Claude and Codex still win when their stronger matchers apply.
  - Preserve explicit detection reasons in the returned profile result so the logs remain actionable.
- How to verify it works:
  - Run the targeted profile spec: `npm test -- src/clientProfiles.spec.ts`
  - Confirm the new ChatGPT OAuth fixtures fail before the change and pass after it.

## Task 2: Prove the HTTP OAuth routes log ChatGPT instead of generic

- Test to write:
  - Extend `src/httpServer.spec.ts` with an end-to-end OAuth scenario that currently fails and asserts `profile.detected` logs `chatgpt` on the relevant OAuth routes instead of `generic`.
  - Cover the same route family seen in the report:
    - discovery/OpenID metadata
    - authorize
    - callback
    - token exchange
  - Keep an assertion that the OAuth flow behavior itself still succeeds so we verify detection changes do not break broker behavior.
- Code to implement:
  - Wire the new request-level detection through the existing HTTP middleware path without weakening generic fallback behavior for non-ChatGPT clients.
  - If needed, add the smallest supporting plumbing so the matcher has access to the request data the OAuth routes already expose.
- How to verify it works:
  - Run the focused server spec: `npm test -- src/httpServer.spec.ts`
  - Confirm the OAuth flow still succeeds and the profile logs switch from `fallback:generic` to `chatgpt` for the ChatGPT scenario.

## Task 3: Final regression sweep and build verification

- Test to write:
  - No new test file; this task is verification-only unless a gap appears during implementation.
- Code to implement:
  - Minimal cleanup only if required by the preceding tasks.
- How to verify it works:
  - Run `npm test -- src/clientProfiles.spec.ts src/httpServer.spec.ts`
  - Run `npm run build`
  - If time permits and the targeted run is clean, run `npm test`

## Assumptions

- The strongest reliable ChatGPT signal is present on these OAuth requests and can be surfaced from the current Express request without redesigning the OAuth broker.
- We will keep test changes under `src/*.spec.ts` and will not modify anything under `tests/`.
