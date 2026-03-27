# Release Please CI Simplification Plan

## Findings

- PR `#136` (`https://github.com/mossipcams/ynab-mcp-bridge/pull/136`) currently shows no attached status checks.
- `gh pr checks 136` returns `no checks reported on the 'release-please--branches--main--components--ynab-mcp-bridge' branch`.
- The current setup skips the normal `CI` and `Validate PR Title` workflows for `release-please--` branches, then tries to compensate by dispatching `.github/workflows/release-please-pr-checks.yml`.
- Those dispatched and `pull_request_target` runs do execute, but they are not reliably attached to the PR head SHA, so they do not solve the missing-checks problem.

## Working Assumption

- For release-please PRs, "smoke tests" means a lightweight single-node path that runs `npm run test:ci`, `npm run typecheck`, and `npm run build`.
- "Validations should be reported" means the checks must be created directly from a PR-triggered workflow so they appear in the PR Checks UI and in `gh pr checks`.

## Task 1

- What test to write:
  - Update [src/releasePlease.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/releasePlease.spec.ts) so it fails unless release-please PR validation is driven by a PR-attached workflow instead of `gh workflow run` dispatching.
  - Update [src/codeQuality.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/codeQuality.spec.ts) so it fails unless the repo defines a lightweight reported workflow for `release-please--` PR branches and no longer depends on the current dispatch-only helper design.
- What code to implement:
  - Simplify [release-please.yml](/Users/matt/Desktop/Projects/ynab-mcp-bridge/.github/workflows/release-please.yml) so it only runs `release-please-action`.
  - Replace the current release-please PR helper workflow with a PR-triggered smoke workflow that runs directly on release-please branches and reports visible checks.
- How to verify it works:
  - Run the targeted Vitest command for [src/releasePlease.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/releasePlease.spec.ts) and [src/codeQuality.spec.ts](/Users/matt/Desktop/Projects/ynab-mcp-bridge/src/codeQuality.spec.ts).
  - Confirm the workflow files no longer contain `gh workflow run` or `workflow_dispatch`-only release PR orchestration.

## Task 2

- What test to write:
  - Tighten workflow assertions so release-please PRs fail unless they only run the intended smoke path and normal PRs still keep the full matrix and title validation behavior.
- What code to implement:
  - Update [test.yml](/Users/matt/Desktop/Projects/ynab-mcp-bridge/.github/workflows/test.yml) or the dedicated release workflow so release-please branches run only the smoke job instead of the full 22.x/24.x validation matrix.
  - Preserve the existing skip behavior for full CI and normal PR title validation on release-please branches unless the new smoke workflow explicitly replaces that reporting.
- How to verify it works:
  - Re-run the targeted Vitest command and inspect the relevant workflow YAML for the final event conditions and job names.
  - If the targeted tests pass cleanly, run one additional local smoke verification command covering the chosen release-please path.

## Task 3

- What test to write:
  - Add or update assertions that the reported release-please validations stay intentionally lightweight and visible, so we do not regress back to invisible no-op checks.
- What code to implement:
  - Finalize the job naming and conditions so the reported checks are easy to understand in GitHub, for example a smoke job plus one lightweight validation/reporting job if needed.
  - Remove any obsolete workflow file or dead assertions left over from the dispatch-based design.
- How to verify it works:
  - Run the local targeted test command again after cleanup.
  - Use `gh pr checks` expectations as the acceptance target after the workflow is merged and re-run on the next release-please PR.

## Execution Note

- The current checkout is on `fix/cors-cf-utility-dedup`, not `main`.
- If you approve implementation, I will pause before any branch/worktree step so we do not disturb the current worktree unexpectedly.
