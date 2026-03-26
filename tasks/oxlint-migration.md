# Phase 2: Oxlint Plus `tsgolint` Migration

## Current Baseline

- Phase 1 of the Quality Stack Completion Plan must be fully verified (Task 8 passing with clean `build`, `lint`, and `typecheck`).
- Phase 1 is complete in this worktree and currently verifies cleanly with `build`, `lint`, and `typecheck`.
- The repo currently pins `typescript` to `^5.3.3`, and live npm metadata still reports latest TypeScript as `5.9.3`.
- Live npm metadata reports:
  `oxlint` `1.56.0`
  and `oxlint-tsgolint` `0.17.1`.
- `tsconfig.json` still contains legacy compiler resolution settings:
  `baseUrl: "./src"`
  and
  `paths: { "/*": ["./*"] }`.
- The current repo import graph appears to rely on relative imports rather than the `baseUrl` alias, which makes local removal of those settings a realistic first prerequisite task.
- CI currently has no Oxlint step.
  Required validation is still:
  tests,
  coverage,
  dependency rules,
  ESLint,
  typecheck,
  Knip,
  then build.

## Decision Goal

Phase 2 is complete when the repo reaches one of these verified end states:

- Preferred:
  a stable non-blocking Oxlint pilot exists in the repo, local prerequisites under repo control have been removed, and the pilot is documented as advisory while ESLint remains the required gate.
- Acceptable fallback:
  the repo proves Oxlint cannot yet provide a low-noise or compatible pilot, and that result is documented with enough evidence to stop further rollout work without ambiguity.

Phase 2 does not require replacing ESLint.
It also does not require forcing Oxlint into CI if the pilot evidence is weak.

## Acceptance Criteria

- `tsconfig.json` no longer carries repo-local settings that are already known to block the pilot, unless a failing verification step proves they are still needed.
- The repo has a dedicated Oxlint pilot artifact set:
  dependency entries,
  config file,
  and `lint:oxlint` script.
- The pilot can be executed locally and produces one of two acceptable results:
  clean startup plus coherent diagnostics,
  or a documented incompatibility that justifies keeping the pilot exploratory-only.
- Any CI integration added in this phase must remain advisory.
  ESLint, typecheck, and build stay as the required gates.
- The final decision is written down explicitly:
  local-only experiment,
  or non-blocking CI advisory step.

## Decision Bar

Choose `pilot only` if any of the following remain true after the pilot:

- Oxlint or `tsgolint` still depends on prerequisites this repo cannot satisfy cleanly.
- The pilot output is noisy enough that developers would routinely ignore it.
- Rule overlap with the current ESLint type-aware role is too weak to justify workflow changes.
- The repo would need broad import rewrites or risky TypeScript config churn for marginal benefit.

Choose `safe to wire into CI as advisory` only if all of the following are true:

- the pilot starts reliably in this repo,
- the remaining config is understandable and low-churn,
- diagnostics are actionable rather than noisy,
- and adding the step does not disturb the existing required validation order.

## Tasks

- [x] Task 9: Add a non-code migration note that captures current blockers and target acceptance criteria
  Test to write:
  No automated test for this task because it is Markdown-only planning.
  Code to implement:
  Record the current blockers (TS 7.0+ requirement, `baseUrl` incompatibility) and define the acceptance criteria for enabling Oxlint in CI.
  How to verify it works:
  Review the note for accuracy against the current repo config and the referenced upstream docs.

- [x] Task 10: Create a prerequisite-removal plan for Oxlint compatibility
  Test to write:
  Add or extend `src/codeQuality.spec.ts` only if we decide to codify a prerequisite such as removal of `baseUrl` or addition of a dedicated `tsconfig.oxlint.json`.
  Otherwise no test in this task because it is still design work.
  Code to implement:
  Decide whether the cleanest path is:
  remove `baseUrl`,
  introduce path aliases via standard package exports or relative imports,
  or add a separate Oxlint-oriented tsconfig with supported options.
  Keep this task planning-only unless the chosen prerequisite is tiny and obviously safe.
  How to verify it works:
  Compare the chosen approach against current imports and tsconfig usage to ensure it is realistic before implementation begins.

- [x] Task 11: Pilot Oxlint plus `tsgolint` in a non-blocking local or CI path
  Test to write:
  Add a guardrail test only after the pilot path is stable enough to keep.
  The red signal for the initial pilot should be the tool output itself, not a permanent repo test.
  Code to implement:
  Add `oxlint` and `oxlint-tsgolint`,
  create an Oxlint config,
  and wire a non-blocking script such as `lint:oxlint`.
  Enable a minimal first rule set that overlaps with the current type-aware `no-unsafe-*` and promise rules.
  Do not remove ESLint yet.
  How to verify it works:
  Run the pilot script locally and capture:
  startup success,
  compatibility with the repo tsconfig setup,
  and the first actionable diagnostics.

- [x] Task 12: Decide whether Oxlint can replace the type-aware ESLint role
  Test to write:
  If we proceed, add guardrail assertions for the new script, config, and CI step after the replacement decision is approved.
  Code to implement:
  Compare rule coverage and false-positive rate between:
  current ESLint type-aware rules,
  and Oxlint plus `tsgolint`.
  If coverage is still insufficient or the TS7 prerequisites are too disruptive, keep Oxlint as an experiment and retain ESLint as primary.
  How to verify it works:
  Summarize the comparison and stop for approval before making Oxlint a required CI gate.

## Phase 2 Result Template

- Final decision:
  keep Oxlint as a permanent advisory CI pilot while retaining ESLint as the required lint gate.
- Verified commands:
  `npm run test -- --run src/codeQuality.spec.ts -t "removes legacy tsconfig path alias settings before the Oxlint pilot"`
  `npm run typecheck`
  `npm run lint`
  `npm run build`
  `npm run test -- --run src/codeQuality.spec.ts -t "defines the Oxlint pilot dependencies, config, and script"`
  `npm run lint:oxlint`
  `npm run test -- --run src/codeQuality.spec.ts -t "keeps Oxlint advisory when wired into CI"`
  `npm run test -- --run src/codeQuality.spec.ts`
- Follow-up outside this phase:
  Revisit broader Oxlint rule coverage only after the upstream type-aware rule surface grows enough to justify comparing it against more of the existing ESLint stack.

## Interim Outcome After Task 12

- The starter Oxlint pilot is stable on this repo after removing `baseUrl` and `paths`.
- The pilot currently runs against `src/`, excludes spec files, and overlaps with a narrow but meaningful slice of the existing ESLint type-aware rules:
  `typescript/no-floating-promises`
  and the `no-unsafe-*` family.
- The first verified run completed successfully with:
  `0` warnings,
  `0` errors,
  and a runtime of about `1.1s` on `85` files.
- Decision after Task 12:
  the pilot is strong enough to keep and is safe to wire into CI as an advisory step,
  but it is not strong enough to replace ESLint.

## Interim Outcome After Task 13

- The repo now keeps the Oxlint pilot as a permanent artifact set:
  `oxlint`,
  `oxlint-tsgolint`,
  `.oxlintrc.json`,
  and `npm run lint:oxlint`.
- CI now runs `npm run lint:oxlint` as `Run Oxlint advisory pilot` on the Node `22.x` job with `continue-on-error: true`.
- ESLint remains the required lint gate.
  The advisory Oxlint step does not replace or weaken ESLint, typecheck, Knip, or build.

## Final Outcome After Task 14

- Phase 2 is complete.
- The repo-local blocker under our control was removed by deleting `baseUrl` and `paths` from `tsconfig.json`.
- The Oxlint pilot starts reliably, remains low-churn, and is now visible in CI without becoming a required gate.
- Final decision:
  keep the pilot,
  keep it advisory,
  and keep ESLint as primary until Oxlint's type-aware coverage is strong enough to justify a stricter comparison.
