# Lessons

- When the user reprioritizes roadmap items, update the implementation plan to emphasize the highest-leverage gaps instead of keeping lower-effort but lower-impact additions near the top.
- When writing a repo execution plan, make the TDD structure explicit for every code-change slice: red test first, then minimal implementation, then verification.
- When the user clarifies the target architecture, revise the subsystem granularity to match that architecture before implementation; do not keep an over-fragmented plan if the goal is a modular monolith.
- Before labeling duplicate-code findings as unwanted, check the active architecture plan and current ownership specs so intended monolith consolidations are not misclassified as accidental duplication.
- When a repo requires one-task-at-a-time TDD, split architectural refactors into boundary-spec, extraction, and verification slices that each fit the expected 5-15 minute loop.
- When a user reports post-deploy behavior after a released fix, treat that runtime result as stronger evidence than a local architectural hypothesis; do not assume the deployed symptom is resolved just because the code change matched a plausible failure mode.
- When diagnosing MCP client compatibility, add bridge-side observability before committing to a root-cause theory; a hypothesis about URI schemes or client behavior is not strong enough until the live logs prove which MCP methods actually reached the server.
