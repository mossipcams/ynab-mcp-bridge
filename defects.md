# Defect Ledger

Confirmed production issues discovered by stronger tests go here.

Entry template:

```
- Severity: Medium | High | Critical
  Status: Open | Fixed
  File:
  Failing test:
  Observed behavior:
  Impact:
  Fix:
```

## Critical

None yet.

## High

None yet.

## Medium

- Severity: Medium
  Status: Fixed
  File: `scripts/tech-debt-report.mjs`
  Failing test: `src/techDebtReport.spec.ts` - `ignores Windows-style paths inside excluded directories`
  Observed behavior: `isRepoOwnedCodePath("dist\\index.js")` and `isRepoOwnedCodePath("node_modules\\left-pad\\index.js")` returned `true`, so Windows-style paths inside excluded directories were treated as repo-owned code.
  Impact: Tech-debt metrics could accidentally scan generated output or third-party dependencies on Windows-style paths, skewing counts and making the report inconsistent across platforms.
  Fix: Normalized relative paths by converting backslashes to forward slashes before applying ignored-directory checks.

- Severity: Medium
  Status: Fixed
  File: `src/reliabilityArtifact.ts`
  Failing test: `src/reliabilityArtifact.spec.ts` - `rejects baseline comparisons when the profile or target does not match`
  Observed behavior: `compareReliabilityArtifacts()` allowed a baseline artifact with target mode `url` to be compared against a current artifact with target mode `local` when both used the same URL string.
  Impact: Reliability regressions from different execution environments could be compared as if they were equivalent, producing misleading pass/fail results.
  Fix: Included `target.mode` alongside `target.url` in the target-identity guard before comparing artifacts.

- Severity: Medium
  Status: Fixed
  File: `src/reliabilityHttp.ts`
  Failing test: `src/reliabilityHttp.spec.ts` - `treats malformed baseline artifact schema as a baseline read error`
  Observed behavior: A malformed baseline artifact missing `target` passed the initial schema guard, then failed later with `Cannot read properties of undefined (reading 'mode')` instead of surfacing a baseline-read error.
  Impact: Operators received an internal exception instead of an actionable baseline-artifact validation error, making reliability failures harder to diagnose.
  Fix: Strengthened runtime artifact validation to require a `target` object with a valid `mode` and `url` before accepting a parsed baseline.

- Severity: Medium
  Status: Fixed
  File: `src/reliabilityHttp.ts`
  Failing test: `src/reliabilityHttp.spec.ts` - `stops the measured sequence after a failed tools/list validation`
  Observed behavior: `runMeasuredHttpSequence()` continued into `tools/call` steps even after `tools/list` failed validation because `ynab_get_mcp_version` was missing.
  Impact: Reliability runs could report cascaded follow-up successes or failures after the core capability check already failed, obscuring the real root cause and inflating probe noise.
  Fix: Returned early after a failed `tools/list` measurement instead of executing any subsequent tool calls.

- Severity: Medium
  Status: Fixed
  File: `src/reliabilityHttp.ts`
  Failing test: `src/reliabilityHttp.spec.ts` - `rejects value flags when the next token is another flag instead of a value`
  Observed behavior: `parseReliabilityHttpArgs(["--url", "--requests", "2"])` treated `--requests` as the URL value, then failed later with the misleading error `Expected 2 to be followed by a value.`
  Impact: Malformed CLI input produced confusing, misattributed errors instead of pointing to the actual missing flag value.
  Fix: Rejected flag-shaped next tokens for value-taking arguments so missing values fail immediately with the correct flag name.

- Severity: Medium
  Status: Fixed
  File: `src/reliabilityLoadSuite.ts`
  Failing test: `src/reliabilityLoadSuite.spec.ts` - `rejects value flags when the next token is another flag instead of a value`
  Observed behavior: `parseReliabilityLoadArgs(["--url", "--dry-run"])` accepted `--dry-run` as the URL value instead of treating it as a missing value for `--url`.
  Impact: The load-suite CLI could silently misparse malformed input and run against an invalid target instead of failing fast with a clear message.
  Fix: Rejected flag-shaped next tokens for value-taking load-suite arguments so missing values fail immediately.

- Severity: Medium
  Status: Fixed
  File: `src/packageInfo.ts`
  Failing test: `src/packageInfo.spec.ts` - `does not let callers mutate the cached package metadata`
  Observed behavior: Mutating the object returned by `getPackageInfo()` changed the value later returned by `getPackageVersion()`, because the cached package metadata was stored and returned by reference.
  Impact: Any in-process caller could corrupt shared package metadata for the rest of the process, leading to incorrect version/name reporting.
  Fix: Stored the cached package metadata as an immutable frozen object before returning it.

- Severity: Medium
  Status: Fixed
  File: `tsconfig.json`
  Failing test: `src/buildArtifacts.spec.ts` - `does not ship contract-only modules in dist`
  Observed behavior: The production build emitted `dist/typeUtils.contract.js`, leaking a contract-only source file into the shipped runtime artifact.
  Impact: Published/built artifacts included non-runtime files, increasing package noise and risking confusion about supported production surface area.
  Fix: Excluded `**/*.contract.ts` from the production TypeScript build.

- Severity: Medium
  Status: Fixed
  File: `tsconfig.json`
  Failing test: `src/buildArtifacts.spec.ts` - `does not ship auth2 harness modules in dist`
  Observed behavior: The production build emitted `dist/auth2/harness/e2eHarness.js` and `dist/auth2/harness/fakeProvider.js` even though the `auth2` harness is test scaffolding, not runtime surface.
  Impact: Published/built artifacts included e2e/test harness code, expanding the shipped package with non-production modules.
  Fix: Excluded `src/auth2/harness` from the production TypeScript build.

- Severity: Medium
  Status: Fixed
  File: `src/httpTransport.ts`
  Failing test: `src/httpServerStructure.spec.ts` - `rejects an empty MCP session header value as malformed input`
  Observed behavior: A request with `Mcp-Session-Id: "   "` was accepted and routed through MCP handling as if the session header were absent.
  Impact: Malformed session metadata could silently bypass request validation, making protocol debugging harder and weakening input hygiene on the HTTP transport.
  Fix: Tightened session-header validation to require exactly one non-empty value whenever `Mcp-Session-Id` is present.

- Severity: Medium
  Status: Fixed
  File: `src/httpTransport.ts`
  Failing test: `src/httpServerStructure.spec.ts` - `rejects comma-delimited MCP session header values with empty segments`
  Observed behavior: A request with `Mcp-Session-Id: "session-1,"` was accepted and normalized to `session-1` instead of being rejected as malformed header syntax.
  Impact: Invalid session-header syntax could be silently rewritten by the transport, hiding client bugs and weakening protocol validation.
  Fix: Rejected any present `Mcp-Session-Id` header that is empty or contains comma-delimited syntax instead of exactly one raw non-empty token.
