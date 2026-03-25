# Lessons

- When the user reprioritizes roadmap items, update the implementation plan to emphasize the highest-leverage gaps instead of keeping lower-effort but lower-impact additions near the top.
- When the user defines a quality metric as "whole codebase", do not silently narrow it to implementation-only code; keep only generated/vendor exclusions unless the user explicitly asks for a curated subset.
## Duplicate baseline corrections

- When the user says the baseline should reflect duplicate features/functions, do not keep reporting the raw JSCPD whole-codebase percentage as the main success metric.
- Treat JSCPD as supporting evidence for lexical overlap, and define the primary baseline around overlapping feature families or shared behavioral seams instead.
- Do not recommend consolidation unless the overlap is architecturally unnecessary; some similar code should remain separate when responsibilities are genuinely different.
- If a tech-debt hotspot exists only for backward compatibility and the user explicitly accepts the migration break, prefer deleting the compatibility path over refactoring it further.
