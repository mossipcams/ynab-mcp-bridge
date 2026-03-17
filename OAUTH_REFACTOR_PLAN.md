# OAuth Refactor Plan

This plan is anchored on current primary sources as of March 16, 2026:

- [RFC 9700 OAuth 2.0 Security Best Current Practice](https://www.ietf.org/rfc/rfc9700.html)
- [RFC 7591 OAuth 2.0 Dynamic Client Registration Protocol](https://www.rfc-editor.org/rfc/rfc7591)
- [RFC 8414 OAuth 2.0 Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414.html)
- [RFC 9126 OAuth 2.0 Pushed Authorization Requests](https://www.rfc-editor.org/rfc/rfc9126)
- [RFC 9449 OAuth 2.0 Demonstrating Proof-of-Possession at the Application Layer (DPoP)](https://www.rfc-editor.org/rfc/rfc9449)
- [RFC 8252 OAuth 2.0 for Native Apps](https://www.rfc-editor.org/info/rfc8252)
- [OAuth Browser-Based Apps BCP draft -26](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/)

Assumption: keep the bridge as a shared-backend YNAB service with optional OAuth, but harden it into a clearer single-tenant OAuth broker and resource server rather than a general-purpose authorization server.

## Execution Order

1. Tasks 1-4 first to stabilize the external surface and reduce security risk quickly.
2. Tasks 5-7 next to modernize the auth and grant model.
3. Tasks 8-12 last for advanced hardening, persistence, and rollout safety.

## Tasks

### Task 1: Freeze current OAuth behavior with characterization tests

Test:
- Add focused specs for discovery metadata, dynamic registration, consent rendering, callback exchange, token issuance, refresh, direct upstream bearer rejection, and origin handling edge cases.

Code:
- Add a small OAuth flow fixtures helper layer in `src/httpServer.spec.ts` and `src/oauthBroker.spec.ts` so the current contract is explicit before refactoring.

Verify:
- Run `npm test -- --run src/httpServer.spec.ts src/oauthBroker.spec.ts` and confirm the characterization suite passes unchanged.

### Task 2: Extract a dedicated OAuth application core

Test:
- Add unit tests for a new pure service layer that models `registerClient`, `startAuthorization`, `approveConsent`, `handleCallback`, `exchangeCode`, and `exchangeRefreshToken`.

Code:
- Move broker logic out of `src/oauthBroker.ts` into a cohesive core module with explicit interfaces for client registry, grant store, token service, and upstream provider client.

Verify:
- Run the new unit tests plus the existing HTTP integration tests to confirm the web adapter still matches current behavior.

### Task 3: Replace ad hoc HTML rendering with a hardened consent UI boundary

Test:
- Add tests proving client metadata is escaped in consent HTML and that unexpected markup or script content is rendered inert.

Code:
- Replace string interpolation in the consent page with an escaping or template helper, add CSP and safer response headers for consent pages, and constrain accepted client metadata fields.

Verify:
- Run consent-focused specs and manually inspect the rendered page payload for escaped output and CSP headers.

### Task 4: Separate browser-origin policy from CORS policy

Test:
- Add specs covering allowed bridge origin, allowed remote MCP client origin, denied foreign origin, no-origin requests, and preflight behavior.

Code:
- Extract origin and CORS logic from `src/httpServer.ts` into a dedicated policy module that can emit route-specific `Access-Control-Allow-Origin` values instead of global `*`, while keeping exact-origin matching.

Verify:
- Run `src/httpServer.spec.ts` and confirm both OAuth setup routes and `/mcp` behave correctly for `https://claude.ai` and the bridge's own public origin.

### Task 5: Tighten client registration and redirect validation to current BCP

Test:
- Add failing tests for non-exact redirect URI matches, unsafe redirect URIs, overbroad registration metadata, and untrusted post-consent redirect attempts.

Code:
- Enforce exact redirect URI matching, normalize and validate registered client metadata more strictly, and prepare the registration model for policy-based admission instead of fully open dynamic registration.

Verify:
- Run registration and authorization tests and confirm only exact, pre-registered redirect URIs succeed.

### Task 6: Introduce a first-class grant model

Test:
- Add unit tests for persisted grants keyed by `grantId`, `clientId`, `resource`, `scope`, and subject or session context, including revocation and expiration rules.

Code:
- Refactor the persistence schema away from loose pending, auth-code, and refresh-token maps toward a typed grant aggregate with explicit lifecycle transitions.

Verify:
- Run broker persistence tests and confirm restart behavior still works with the new schema.

### Task 7: Harden token lifecycle and refresh handling

Test:
- Add failing tests for refresh token replay detection, revoked-grant behavior, grant-bound scope or resource enforcement, and token invalidation on suspected replay.

Code:
- Implement refresh token rotation or another replay-detection mechanism aligned with RFC 9700, bind refresh tokens explicitly to grant, resource, and scope, and centralize token issuance and verification.

Verify:
- Run token and refresh-flow tests and confirm replay or mismatched resource or scope requests fail deterministically.

### Task 8: Add optional sender-constrained token support behind a feature flag

Test:
- Add integration tests for DPoP-protected token requests and protected resource access, while preserving current bearer-mode compatibility when disabled.

Code:
- Introduce an abstraction for token proofing and implement optional DPoP support on `/token` and `/mcp` paths.

Verify:
- Run the new DPoP suite plus existing bearer-mode tests to confirm backward compatibility.

### Task 9: Replace the plaintext file store with a pluggable secure persistence interface

Test:
- Add contract tests that every store implementation must pass for atomic writes, restart recovery, expiry pruning, and concurrent access expectations.

Code:
- Define a storage interface, keep the file store as a development adapter, add permission checks and safer file creation behavior, and prepare for a production-grade store backend.

Verify:
- Run store contract tests against the file implementation and confirm current restart tests still pass.

### Task 10: Make deployment mode explicit in config and docs

Test:
- Add config tests for `authless`, `oauth-single-tenant`, and future `oauth-hardened` modes, including required env validation and incompatible-option failures.

Code:
- Refactor runtime config into clearer deployment profiles, make `MCP_PUBLIC_URL` and allowed-origin expectations less error-prone, and update docs to describe the bridge as a shared-backend OAuth broker rather than user-delegated YNAB auth.

Verify:
- Run config and runtime tests and do a docs sanity pass against actual startup behavior.

### Task 11: Add a security regression suite

Test:
- Add targeted tests for consent XSS, origin confusion, forwarded-header abuse, open redirect behavior, callback state reuse, and upstream or local token confusion.

Code:
- Create a dedicated security-spec file that exercises the hardening points directly instead of only as side effects of happy-path integration tests.

Verify:
- Run the security suite independently and include it in normal CI.

### Task 12: Finish with a migration and compatibility pass

Test:
- Add migration tests for old persisted OAuth state and rolling upgrades where possible.

Code:
- Provide store migration and versioning, deprecation notes for legacy config behavior, and compatibility shims where needed.

Verify:
- Run the full test suite, build, and exercise one end-to-end OAuth flow manually against a local server.
