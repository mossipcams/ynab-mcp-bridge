# Lessons

- When the user reprioritizes roadmap items, update the implementation plan to emphasize the highest-leverage gaps instead of keeping lower-effort but lower-impact additions near the top.
- When writing a repo execution plan, make the TDD structure explicit for every code-change slice: red test first, then minimal implementation, then verification.
- When the user clarifies the target architecture, revise the subsystem granularity to match that architecture before implementation; do not keep an over-fragmented plan if the goal is a modular monolith.
- When a repo requires one-task-at-a-time TDD, split architectural refactors into boundary-spec, extraction, and verification slices that each fit the expected 5-15 minute loop.
