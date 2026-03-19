# AGENTS.md

## Workflow (STRICT)

For ANY code change, follow this exact sequence:

### Step 1: Plan
- Break work into small tasks (5-15 min each)
- Save the complete plan to a Markdown file in the repository before presenting it
- For each task, specify:
  * What test to write
  * What code to implement
  * How to verify it works
- Show the complete plan
- STOP and say: "Plan ready. Approve to proceed."
- WAIT for approval

### Step 2: Execute with TDD
For each task after approval:
1. Write failing test -> run it -> show failure
2. Write minimal implementation -> run test -> show pass
3. Ask: "Task N done. Continue?" -> wait for yes

## Branch Rules

For implementation work, always start a new branch from `main` unless the user explicitly says otherwise.
When starting a new branch, first update or rebase from the latest `main` so the branch begins from current `main` unless the user explicitly says otherwise.
If the current branch is not `main`, do not switch branches automatically when that could disturb existing work; pause and confirm first.
Use `git worktree` when it makes sense to keep branch-based work isolated without disturbing the current working tree.

## PR Rules

Default PR creation to `mossipcams/ynab-mcp-bridge`.
Do not open PRs, create commits for, push to, or take any other action against a different repository unless the user explicitly asks for that target repo.
PR titles must use a releasable Conventional Commit format: `feat: ...`, `fix: ...`, `deps: ...`, or `revert: ...`.
When creating or updating a PR, keep the title aligned with the actual change type and scope so it passes CI title validation.

## Markdown-Only Changes

If a change is limited to Markdown files such as `.md`, it does not require TDD and does not require the plan/approval workflow above.
Administrative git and GitHub operations such as staging, committing, pushing, creating PRs, updating PRs, merging PRs, rerunning workflows, deleting branches, or managing releases also do not require TDD.
