# Consent CSP Form-Action Fix Plan

1. Add consent-page CSP regression coverage.
Test to write: update the consent-page hardening spec to prove the `Content-Security-Policy` header still includes `default-src 'none'` and `form-action 'self'`, and also includes the upstream authorization origin when OAuth mode is enabled.
Code to implement: none in this step.
How to verify: run `npx vitest run src/httpServer.spec.ts -t "escapes client metadata and sends hardened headers on the consent page"`.

2. Implement a narrow consent-page CSP builder.
Test to write: use the failing consent-page spec from task 1.
Code to implement: replace the static consent-page CSP header in `src/oauthBroker.ts` with a helper that appends the configured upstream authorization origin to `form-action` while keeping the existing hardening directives.
How to verify: rerun `npx vitest run src/httpServer.spec.ts -t "escapes client metadata and sends hardened headers on the consent page"`.

3. Run focused verification and rebuild generated output.
Test to write: none unless another gap appears.
Code to implement: rebuild `dist` if the TypeScript output changes.
How to verify: run `npx vitest run src/httpServer.spec.ts` and `npm run build`.
