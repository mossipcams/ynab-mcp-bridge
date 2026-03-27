# Release Please Validate Removal Plan

## Findings

- PR [#142](https://github.com/mossipcams/ynab-mcp-bridge/pull/142) is a standard Release Please version-bump PR and its file diff does not include any `validate` content changes.
- The repository has a custom workflow at [.github/workflows/release-please-pr-checks.yml](/Users/matt/Desktop/Projects/ynab-mcp-bridge/.github/workflows/release-please-pr-checks.yml) whose only purpose is to add placeholder `validate (22.x)`, `validate (24.x)`, and `validate-pr-title` jobs to Release Please PRs.
- [.github/workflows/release-please.yml](/Users/matt/Desktop/Projects/ynab-mcp-bridge/.github/workflows/release-please.yml) explicitly dispatches that workflow after Release Please updates a PR branch.
- The current test guardrails in [src/releasePlease.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/releasePlease.spec.ts) and [src/codeQuality.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/codeQuality.spec.ts) currently lock in that behavior, so they will need to change first under TDD.
- The current checkout is a dirty non-`main` branch, so if you approve execution I should use a separate worktree or otherwise pause before any branch switch to avoid disturbing your in-progress changes.

## Working Assumption

- "validates added to it that should not be there" refers to those placeholder Release Please check jobs being attached to Release Please PRs.
- The desired outcome is that Release Please PRs stop receiving those dedicated `validate*` placeholder checks, while normal PR validation behavior remains unchanged.

## Task 1

- What test to write:
  - Update [src/releasePlease.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/releasePlease.spec.ts) so it fails unless the Release Please workflow no longer dispatches release-only validation jobs.
- What code to implement:
  - Remove the dispatch step from [.github/workflows/release-please.yml](/Users/matt/Desktop/Projects/ynab-mcp-bridge/.github/workflows/release-please.yml) so Release Please only creates or updates the PR.
- How to verify it works:
  - Run `npx vitest run src/releasePlease.spec.ts` and confirm the updated assertion passes.
  - Inspect the workflow file and confirm there is no `gh workflow run release-please-pr-checks.yml` step.

## Task 2

- What test to write:
  - Update [src/codeQuality.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/codeQuality.spec.ts) so it fails unless the repo no longer defines the dedicated Release Please placeholder validation workflow.
- What code to implement:
  - Delete [.github/workflows/release-please-pr-checks.yml](/Users/matt/Desktop/Projects/ynab-mcp-bridge/.github/workflows/release-please-pr-checks.yml).
- How to verify it works:
  - Run `npx vitest run src/codeQuality.spec.ts` and confirm the guardrail passes.
  - Confirm the workflow file is removed from `git status`.

## Task 3

- What test to write:
  - Tighten the workflow assertions in [src/codeQuality.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/codeQuality.spec.ts) so normal CI and PR title validation still skip Release Please branches only where already intended, without the extra placeholder workflow.
- What code to implement:
  - Keep the existing skip conditions in [.github/workflows/test.yml](/Users/matt/Desktop/Projects/ynab-mcp-bridge/.github/workflows/test.yml) and [.github/workflows/validate-pr-title.yml](/Users/matt/Desktop/Projects/ynab-mcp-bridge/.github/workflows/validate-pr-title.yml) if they still match the desired behavior after the placeholder workflow is removed.
  - Make only the minimal workflow changes needed to keep the specs accurate and the behavior explicit.
- How to verify it works:
  - Run `npx vitest run src/releasePlease.spec.ts src/codeQuality.spec.ts`.
  - Optionally run a broader local smoke check such as `npm test -- --runInBand` only if the targeted workflow specs suggest collateral changes.
