---
name: pr-lifecycle
description: Use when the user wants end-to-end GitHub PR lifecycle help for the current repository, including preparing or reusing a branch worktree, creating or updating the PR, waiting for CI to finish, and cleaning up related worktrees and local branches after merge or abandonment.
metadata:
  short-description: Manage PRs, CI, and worktree cleanup
---

# PR Lifecycle

Use this skill when the user wants a PR handled from local branch state through CI and closeout.

## What This Skill Covers

- Inspect the current checkout, branch, and worktree state before touching git state.
- Prefer isolated branch worktrees when the current checkout is detached, dirty, or otherwise risky to disturb.
- Create or update a GitHub PR with the repository's title and target-branch rules.
- Wait for CI to finish and summarize the result.
- Clean up merged or abandoned PR worktrees and local branches without deleting active work.

## Core Rules

- Do not switch away from a dirty or non-`main` checkout automatically if that could disturb existing work.
- If the current checkout is detached or risky, prefer creating or reusing a dedicated worktree.
- Do not remove the current PR worktree just because CI finished. Keep it until the PR is merged or explicitly abandoned.
- Only delete a local branch after confirming it is merged or the user has explicitly approved discarding it.
- Use force removal only for worktrees that are explicitly confirmed disposable.
- Follow any repo-local PR, branch, title, and cleanup rules before using generic defaults.

## Preflight

Start by gathering:

- `git status --short --branch`
- `git worktree list --porcelain`
- `git branch --show-current`
- `git remote -v`
- `gh repo view --json nameWithOwner,defaultBranchRef`

Then classify the workspace:

- Safe in-place branch work:
  clean checkout on the intended branch, no risky local context to disturb
- Reuse existing worktree:
  the branch already has a dedicated worktree and it is the right place to continue
- Create new worktree:
  the current checkout is detached, dirty, or should remain undisturbed

If repo rules say new implementation work should start from `main`, align with `main` in a separate worktree instead of repurposing a risky checkout.

## Worktree Setup

When a new worktree is needed:

1. Fetch first:
   `git fetch --prune origin`
2. Create a dedicated worktree from the intended base:
   `git worktree add -b <branch-name> <path> origin/main`
3. Move into the new worktree and verify:
   `git status --short --branch`

When the branch already exists, prefer reusing its existing worktree instead of creating a duplicate.

## PR Creation Or Update

Before opening a PR:

- Review the diff and run the smallest meaningful verification for the change.
- Confirm the branch is pushed.
- Follow repo title rules such as Conventional Commit prefixes when required.
- Use the repository's default PR target unless repo rules say otherwise.

Common commands:

- Push branch:
  `git push -u origin <branch-name>`
- Create PR:
  `gh pr create --fill`
- View existing PR:
  `gh pr view --json number,url,state,headRefName,baseRefName`
- Update PR body or title when needed:
  `gh pr edit <number> --title "<title>"`

If there is already an open PR for the branch, update it instead of creating a duplicate.

## Wait For CI

After the PR exists:

1. Capture the PR number and URL.
2. Wait on checks:
   `gh pr checks <number> --watch --interval 10`
3. If the watch command is unavailable or insufficient, poll:
   `gh pr view <number> --json statusCheckRollup,mergeStateStatus`

Report one of three states clearly:

- passing
- failing
- pending or blocked

If checks fail and the user wants repair work, use the repo workflow plus any available CI-debug skill such as `gh-fix-ci`.

## Cleanup After Merge Or Abandonment

Only run cleanup after the PR is merged or the user explicitly abandons it.

Recommended sequence:

1. Refresh refs:
   `git fetch --prune origin`
2. Confirm PR state:
   `gh pr view <number> --json state,mergeStateStatus`
3. Remove the specific worktree if it is clean:
   `git worktree remove <path>`
4. Delete the local branch when safe:
   `git branch -d <branch-name>`
5. Prune stale metadata:
   `git worktree prune`

Use `git branch -D` or forced worktree removal only when the user has explicitly approved discarding the remaining state.

## Opportunistic Hygiene

While working on a PR, it is reasonable to identify other stale worktrees, but do not delete them silently.

Safe cleanup candidates usually include:

- merged feature or fix branches
- abandoned PR branches
- temporary detached worktrees used only for conflict resolution or review snapshots

Before deleting any candidate, confirm:

- whether it has uncommitted changes
- whether its branch is merged
- whether another open PR or active task still depends on it

## Final Report

Close with a short report that includes:

- the branch used
- the worktree path used or created
- the PR URL
- final CI status
- cleanup performed
- anything intentionally left in place
