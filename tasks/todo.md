# Type Discipline Implementation Plan

## Goal

Implement a zero-tooling-cost type-safety upgrade that adds:

- Branded types for high-value identifier boundaries
- Readonly-by-default type design for shared/public shapes
- Explicit TS 5.9-era strict compiler options
- Explicit ESLint enforcement for `@typescript-eslint/consistent-type-assertions` and the `@typescript-eslint/no-unsafe-*` family

## Scope

This first slice will enforce the discipline in config and shared/public types, then migrate the highest-leverage ID and collection boundaries. It will not try to nominalize every internal string in one pass.

## Tasks

- [x] Task 1: Add quality guardrail tests for strict config and lint policy
  Test to write:
  Add or extend a repo-quality spec in `src/codeQuality.spec.ts` that fails unless:
  `package.json` declares TypeScript 5.9,
  `tsconfig.json` contains the agreed strictness flags,
  `eslint.config.mjs` contains `@typescript-eslint/consistent-type-assertions`,
  and the effective lint policy still includes the `@typescript-eslint/no-unsafe-*` family.
  Code to implement:
  No production code in this task. Only test coverage that codifies the desired guardrails.
  How to verify it works:
  Run the new targeted Vitest spec and show it failing before config changes. Confirm the failure points at the missing flags/rules rather than unrelated issues.

- [x] Task 2: Tighten TypeScript compiler configuration to the agreed strict baseline
  Test to write:
  Use the failing guardrail test from Task 1 as the red test for config requirements.
  Code to implement:
  Update `package.json` and `tsconfig.json` to the intended baseline:
  pin or bump `typescript` to a 5.9 range,
  keep `strict: true`,
  and add the missing strictness flags such as `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, and `noImplicitOverride` if they fit the codebase cleanly.
  Avoid adding new tools or build steps.
  How to verify it works:
  Re-run the targeted guardrail spec to green, then run `npm run typecheck` to expose any real breakages introduced by the stricter config.

- [x] Task 3: Make ESLint policy explicit for type assertions and unsafe operations
  Test to write:
  Extend the same quality spec so it fails unless `eslint.config.mjs` explicitly sets `@typescript-eslint/consistent-type-assertions` to `"never"` and preserves the type-aware unsafe-operation rules.
  Code to implement:
  Update `eslint.config.mjs` to add explicit rule entries instead of relying only on inherited presets.
  Keep the current test-file overrides intact unless the stricter rules force a small, justified adjustment.
  How to verify it works:
  Run the targeted spec again, then run `npm run lint`. If lint surfaces new unsafe patterns, capture them and stop to re-plan if the fix set expands beyond the planned slice.

- [x] Task 4: Introduce shared branded-type primitives and readonly-first helper types
  Test to write:
  Add a compile-time contract file in `src/` that uses `// @ts-expect-error` and assignability checks to prove:
  plain `string` is not assignable to branded IDs,
  branded IDs remain usable as strings where intended,
  readonly collections reject mutation,
  and object helper types expose readonly properties by default.
  Code to implement:
  Add a small shared type module, for example `src/types/brand.ts` or similar, with:
  a generic `Brand<T, Name>` helper,
  branded aliases for the first set of IDs,
  and readonly utility aliases for arrays/records/public DTOs.
  Keep it purely type-level with zero runtime cost.
  How to verify it works:
  Run `npm run typecheck` and show the contract file passing. Confirm no emitted runtime code or tooling additions are needed.

- [x] Task 5: Migrate the highest-value public/domain boundaries to the new types
  Test to write:
  Add or extend targeted specs around the most important entry points, likely config resolution and one or two representative tools/helpers, so they fail when mutable arrays or raw strings are still accepted where branded/readonly types should be used.
  Prefer adding specs under `src/*.spec.ts` rather than any `tests/` directory.
  Code to implement:
  Update the shared/public shapes first, likely including:
  config-facing `planId` handling,
  selected tool input types such as `planId`, `accountId`, `categoryId`, `payeeId`, and `transactionId`,
  and readonly arrays/records in exported types like request context and profile/config structures.
  Constrain the migration to the highest-leverage boundaries so the change stays reviewable.
  How to verify it works:
  Run the targeted specs for the migrated modules, then `npm run typecheck` to prove the branded/readonly constraints hold across real call sites.

- [~] Task 6: Clean up strictness fallout and complete full verification
  Test to write:
  Use the existing failing tests/lint/typecheck output as the red signal for any fallout caused by Tasks 2 through 5.
  Do not weaken assertions; fix implementation and types instead.
  Code to implement:
  Apply the smallest necessary follow-up changes to satisfy the stricter compiler/lint rules and readonly/branded contracts.
  This may include replacing unsafe assertions, narrowing `unknown` safely, and updating mutable collection types to readonly variants.
  How to verify it works:
  Run, at minimum:
  `npm run test -- --run src/codeQuality.spec.ts`
  targeted module specs touched by the migration,
  `npm run lint`,
  `npm run typecheck`,
  and `npm run build` if typecheck/lint pass cleanly.
  Add a short results section to this file before closing out.

## Notes

- Use TDD for every non-Markdown task after approval: failing test first, then minimal implementation, then proof.
- Do not modify files under a `tests/` directory.
- If stricter TS flags create repo-wide churn beyond the planned slice, stop after the first failing proof, summarize the expansion, and re-plan before continuing.

## Results

- Added guardrail coverage in `src/codeQuality.spec.ts` for TS 5.9, strict compiler flags, explicit `consistent-type-assertions`, and effective `no-unsafe-*` lint rules.
- Tightened `tsconfig.json` with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, and `noImplicitOverride`.
- Made ESLint explicitly forbid type assertions in main TS files while keeping spec-file overrides.
- Added shared zero-runtime branded and readonly helper types in `src/typeUtils.ts`, branded YNAB IDs in `src/ynabTypes.ts`, and compile-time contracts in `src/typeUtils.contract.ts`.
- Migrated high-value boundaries toward readonly/branded usage across config/runtime context, client profile types, plan resolution, and several finance/helper modules.
- Reworked `src/server.ts` into an explicit registry that preserves source-level clarity without whole-module registry indirection.
- Fixed `src/ynabApi.ts` to match the current YNAB SDK `_configuration` shape and keep runtime config normalization branded internally.

## Verification

- Passed: `npm run test -- --run src/codeQuality.spec.ts`
- Passed: `npm run test -- --run src/ynabApi.spec.ts src/config.spec.ts src/serverFactory.spec.ts`
- Passed: `npm run test -- --run src/planReadTools.spec.ts`
- Passed: `npm run test -- --run src/httpServer.spec.ts`
- Attempted: focused ESLint, `npm run build`, and broader TypeScript verification with increased heap.
- Remaining caveat: full `eslint`/`tsc`/`build` runs in this environment remained extremely slow and previously hit Node heap limits before producing a final clean exit, so full static verification is not yet proven locally.
