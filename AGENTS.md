# AGENTS.md

## Workflow (STRICT)

For ANY code change, follow this exact sequence:

### Step 1: Plan

- Break work into small tasks (5-15 min each)
- Enter plan mode by default for any non-trivial task with 3 or more steps or any architectural decision
- Save the complete plan to a Markdown file in the repository before presenting it
- For each task, specify:
  - What test to write
  - What code to implement
  - How to verify it works
- Write the plan with detailed specs up front to reduce ambiguity
- Write the plan to `tasks/todo.md` with checkable items when that file exists or can be added without conflicting with the task
- Show the complete plan
- STOP and say: "Plan ready. Approve to proceed."
- WAIT for approval
- If implementation or verification reveals the plan is wrong, STOP and re-plan before continuing

### Step 2: Execute with TDD

For each task after approval:

1. Write failing test -> run it -> show failure
2. Write minimal implementation -> run test -> show pass
3. Verify the behavior with the smallest meaningful proof beyond the narrow test when relevant, such as logs, targeted manual validation, or comparison against `main`
4. Ask: "Task N done. Continue?" -> wait for yes

### Step 3: Final Verification Before Done

- Never mark a task complete without proving it works
- Use verification steps for the full behavior, not just implementation
- Run relevant tests, inspect logs, and demonstrate correctness
- When useful, diff behavior between `main` and the current changes
- Before closing out, ask whether the result would meet a staff engineer review bar

## Execution Expectations

### Subagent Strategy

- Use subagents liberally for research, exploration, and parallel analysis when available
- Keep one focused task per subagent
- Use subagents to protect the main context window from unnecessary detail
- For complex problems, spend additional parallel compute rather than guessing

### Self-Improvement Loop

- After any user correction, update `tasks/lessons.md` with the mistake pattern when that file exists or can be added safely
- Record a concrete rule that would have prevented the mistake
- Review relevant lessons before starting related work
- Keep refining these lessons until the same class of mistake stops recurring

### Demand Elegance (Balanced)

- For non-trivial changes, pause and ask whether there is a more elegant solution
- If a fix feels hacky, revisit it and implement the cleaner approach
- Do not over-engineer simple, obvious fixes
- Challenge your own implementation before presenting it

### Autonomous Bug Fixing

- When given a bug report, move directly into root cause analysis and resolution
- Use logs, errors, and failing tests as the starting point
- Prefer fixing the problem end-to-end without requiring extra user hand-holding
- When CI is failing as part of the task, investigate and fix it proactively
- Even during autonomous bug fixing, keep to the required TDD loop for code changes unless an explicit exception below applies

## Task Management

1. Plan first in `tasks/todo.md` with checkable items when applicable.
2. Check in after the plan and before implementation.
3. Mark progress as tasks are completed.
4. Summarize changes at a high level as work advances.
5. Add a short review or results section to `tasks/todo.md` when applicable.
6. Capture lessons in `tasks/lessons.md` after corrections.

## Core Principles

- Simplicity first: make every change as simple as possible and touch minimal code.
- No laziness: find root causes, avoid temporary fixes, and work to a senior developer standard.
- Verification is part of implementation, not a final optional step.
- TDD is the default execution model for code changes in this repository.

## Branch Rules

For implementation work, always start a new branch from `main` unless the user explicitly says otherwise.
When starting a new branch, first update or rebase from the latest `main` so the branch begins from current `main` unless the user explicitly says otherwise.
If the current checkout has uncommitted changes, is detached, or is on a branch that should remain undisturbed, do not switch it in place. Create a new `git worktree` from updated `main` unless the user explicitly says otherwise.
Use `git worktree` when it makes sense to keep branch-based work isolated without disturbing the current working tree.

## PR Rules

Default PR creation to `mossipcams/ynab-mcp-bridge`.
Do not open PRs, create commits for, push to, or take any other action against a different repository unless the user explicitly asks for that target repo.
PR titles must use a releasable Conventional Commit format: `feat: ...`, `fix: ...`, `deps: ...`, or `revert: ...`.
When creating or updating a PR, keep the title aligned with the actual change type and scope so it passes CI title validation.
After a PR is merged or explicitly abandoned, clean up the associated local branch and worktree as part of the closeout workflow.
For merged or abandoned PR work, run `git fetch --prune` and `git worktree prune`, then remove the specific worktree and delete the corresponding local branch when it is no longer needed.
Do not leave PR-specific worktrees or local branches behind unless the user explicitly asks to keep them.
Do not remove a worktree that still has uncommitted changes unless the user explicitly approves discarding that work.

## Markdown-Only Changes

If a change is limited to Markdown files such as `.md`, it does not require TDD and does not require the plan/approval workflow above.
Administrative git and GitHub operations such as staging, committing, pushing, creating PRs, updating PRs, merging PRs, rerunning workflows, deleting branches, or managing releases also do not require TDD.
Resolving CI failures or merge conflicts does not require the plan/approval workflow above
and does not require TDD.
