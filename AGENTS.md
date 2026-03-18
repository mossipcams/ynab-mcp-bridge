# AGENTS.md

## PR Rules

Default PR creation to `mossipcams/ynab-mcp-bridge`.
Do not open PRs, create commits for, push to, or take any other action against a different repository unless the user explicitly asks for that target repo.
PR titles must use a releasable Conventional Commit format: `feat: ...`, `fix: ...`, `deps: ...`, or `revert: ...`.
When creating or updating a PR, keep the title aligned with the actual change type and scope so it passes CI title validation.

## Markdown-Only Changes

If a change is limited to Markdown files such as `.md`, it does not require TDD and does not require the plan/approval workflow above.
Administrative git and GitHub operations such as staging, committing, pushing, creating PRs, updating PRs, merging PRs, rerunning workflows, deleting branches, or managing releases also do not require TDD.
