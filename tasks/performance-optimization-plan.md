# Performance Optimization Plan

## Goal

Reduce real user-facing latency for MCP tool calls and connection setup without changing the current public contract:

- HTTP remains compatible with the current sessionless initialize and follow-up POST flow
- stdio startup behavior remains unchanged
- tool outputs and discovery/resource metadata remain identical unless a correctness issue forces a change

## What We Know Now

### Existing lightweight-path baseline

- Baseline run captured at `artifacts/perf/k6-connection-tool-baseline.json`
- Focused local k6 probe used `5` VUs for `15s` against `http://127.0.0.1:3100/mcp`
- The probe measured the current authless sessionless path for `initialize`, `tools/list`, and `tools/call` for `ynab_get_mcp_version`

Results:

- `initialize`: avg `3.69ms`, p95 `6.84ms`, p99 `8.25ms`, max `31.76ms`
- `tools/list`: avg `3.85ms`, p95 `7.15ms`, p99 `8.56ms`, max `16.27ms`
- `tools/call ynab_get_mcp_version`: avg `3.60ms`, p95 `6.98ms`, p99 `8.41ms`, max `18.19ms`
- Total throughput: `1332.78 req/s` with `0%` request failures

### New readout after review

- Lightweight bridge-only operations are already fast locally
- The strongest current latency risk is not raw MCP server bootstrap
- The biggest likely wins are in YNAB-backed tool paths that fetch broad datasets and then filter, sort, paginate, or aggregate in-process
- Shared plan resolution and repeated low-churn reference reads look like better early targets than metadata-only micro-optimizations
- Transport cleanup still matters, but it should follow measured tool-path work unless new benchmarks prove otherwise

## Strategy Shift

This plan now targets **Plan B first**.

Plan B means:

1. Measure representative YNAB-backed tool latency, not just bridge-only calls
2. Remove repeated upstream lookups and broad local scans
3. Add shared caching/helpers for low-churn data
4. Re-measure
5. Only then spend effort on transport/setup micro-optimizations that still show up in the numbers

This high-level plan is the primary roadmap.
The detailed execution follow-up lives in `tasks/mcp-performance-optimization-tdd-plan.md` and should be implemented second, after this plan establishes the direction and benchmark-first priority.

## Constraints And Assumptions

- No files under `tests/` will be modified
- TDD stays strict once implementation starts: failing test first, minimal implementation second, verification third, then stop
- The first implementation pass should prioritize measured wins in YNAB-backed tool paths
- Any optimization that risks stale plan selection, stale cached reference data, or protocol-shape drift must stop for re-planning

## Updated Task Order

- [x] Task 1: Establish a repeatable benchmark for representative YNAB-backed tool paths
  Why first:
  The current baseline is strong for bridge-only calls, so we need numbers for real tool latency before optimizing transport internals.
  Focus:
  Extend the reliability/benchmark path so we can compare lightweight calls with at least one representative YNAB-backed tool and separate bridge overhead from upstream/data-shaping overhead.
  Success signal:
  We have before/after metrics for connection setup plus a representative read-heavy tool path.

- [x] Task 2: Cache resolved plan selection and other repeated routing overhead
  Why second:
  This is a low-risk improvement that sits on many tool paths and should reduce repeated upstream calls before deeper refactors.
  Focus:
  Avoid repeated `plans.getPlans()` work when `planId` is omitted while preserving the current fallback behavior.
  Success signal:
  Repeated tool calls without explicit `planId` no longer pay repeated plan-discovery cost.

- [x] Task 3: Optimize transaction collection and search hot paths
  Why third:
  These tools are the clearest examples of broad fetch-and-process patterns and are likely to benefit immediately from earlier filtering, pagination, and reduced local passes.
  Focus:
  Push pagination/filtering/projection as early as possible and avoid formatting full result sets before trimming.
  Success signal:
  Large mocked transaction sets show lower local processing work and stable output contracts.

- [x] Task 4: Add shared cached snapshots for low-churn reference data
  Why fourth:
  Heavy summary tools repeatedly depend on the same categories, months, accounts, and scheduled transaction context.
  Focus:
  Introduce narrowly scoped cache helpers that can be reused across read-only summary tools.
  Success signal:
  Repeated tool calls reuse cached reference data and upstream call counts drop.

- [x] Task 5: Refactor heavy summary tools around narrower data paths
  Why fifth:
  Once shared helpers exist, the larger summary tools can be simplified and sped up with less duplication and less re-fetching.
  Focus:
  Update the heavier summary tools to use cached reference data, narrower date windows, and shared rollup helpers instead of broad fetch-and-trim patterns.
  Success signal:
  Representative summary-tool latency drops and output remains stable.

- [x] Task 6: Revisit transport/setup work only if it still shows up in the data
  Why sixth:
  Transport work is still valuable, but it should now be justified by the updated measurements rather than assumed.
  Focus:
  Address avoidable connection round trips, response-capture overhead, or repeated immutable setup only if post-Task-5 benchmarks still point there.
  Success signal:
  Any transport changes produce measurable `initialize`/`tools/list` improvement without changing compatibility.

- [x] Task 7: Final measurement, regression guardrails, and cleanup
  Why last:
  We need proof that the work improved the right things and did not create hidden regressions.
  Focus:
  Re-run the benchmark suite, keep the k6/reliability baselines current, and add only the smallest regression coverage needed to lock in the final design.
  Success signal:
  The end state shows clearer measured wins on real tool paths, not just lighter bridge-only paths.

## What Is Explicitly Deferred

- Precomputing immutable tool/discovery metadata before YNAB-backed tool-path work is measured
- Broader session/protocol changes
- Any optimization justified only by theoretical startup cost instead of observed latency

## Expected End State

- We have repeatable benchmarks for both lightweight MCP operations and representative YNAB-backed tool paths
- Repeated plan/category/month/account lookups are reduced through shared caches or reuse
- Transaction-heavy tools avoid unnecessary full-array shaping work
- Summary tools use narrower data paths and shared helpers instead of repeated broad scans
- Transport micro-optimizations are only implemented where post-tool-path measurements still justify them

## Proposed Order

1. Measure representative YNAB-backed latency, not just bridge-only calls
2. Remove repeated plan-resolution overhead
3. Optimize transaction list/search hot paths
4. Add shared reference-data caching and refactor heavy summary tools
5. Re-measure
6. Only then optimize transport/setup work that still matters

## Results

- Added a reusable benchmark seam in `src/reliabilityHttp.ts` via `runMeasuredHttpSequence(...)`, with a focused spec that measures both lightweight MCP calls and a representative YNAB-backed tool call using controlled dependencies.
- Added in-flight default-plan discovery dedupe in `src/tools/planToolUtils.ts`, which removes repeated concurrent `plans.getPlans()` work without caching completed lookups across sequential calls.
- Optimized transaction list and search tools so pagination happens before display formatting and projection, avoiding eager formatting of every matching row.
- Added shared low-churn read caching in `src/tools/cachedYnabReads.ts` for accounts, categories, plan month snapshots, plan month lists, and scheduled transactions.
- Wired the shared cached reads through repeated summary/list paths, including financial snapshot, budget health, goal progress, financial health check, spending summary, cash flow summary, monthly review, category trend, plan month, accounts, categories, months, scheduled transactions, debt summary, upcoming obligations, cash runway, emergency fund coverage, and net worth trajectory.
- Re-ran the lightweight k6 baseline after the changes and confirmed the transport path remains healthy, so no extra transport refactor was justified by the measurements.

## Verification

- `npx vitest run src/reliabilityHttp.spec.ts`
- `npx vitest run src/transactionToolFamily.spec.ts src/aiToolOptimization.spec.ts src/additionalReadTools.spec.ts`
- `npx vitest run src/financeSummaryTools.spec.ts src/financialDiagnostics.spec.ts src/additionalReadTools.spec.ts src/planReadTools.spec.ts src/financeAdvancedTools.spec.ts`
- `npx vitest run src/planToolUtils.spec.ts src/planReadTools.spec.ts src/financeSummaryTools.spec.ts src/financialDiagnostics.spec.ts src/transactionToolFamily.spec.ts src/reliabilityHttp.spec.ts`
- `npm run build`
- `k6 run --summary-export artifacts/perf/k6-connection-tool-post-change.json /tmp/ynab-bridge-k6-baseline.js`

## Baseline Comparison

- Original baseline: `artifacts/perf/k6-connection-tool-baseline.json`
  - `initialize`: avg `3.69ms`, p95 `6.84ms`, p99 `8.25ms`
  - `tools/list`: avg `3.85ms`, p95 `7.15ms`, p99 `8.56ms`
  - `tools/call ynab_get_mcp_version`: avg `3.60ms`, p95 `6.98ms`, p99 `8.41ms`
  - Throughput: `1332.78 req/s`

- Post-change baseline: `artifacts/perf/k6-connection-tool-post-change.json`
  - `initialize`: avg `3.28ms`, p95 `6.75ms`, p99 `8.39ms`
  - `tools/list`: avg `3.84ms`, p95 `7.05ms`, p99 `8.75ms`
  - `tools/call ynab_get_mcp_version`: avg `3.70ms`, p95 `6.89ms`, p99 `8.45ms`
  - Throughput: `1371.82 req/s`

The transport path stayed effectively flat-to-slightly-better, which supports the strategy shift toward tool-path and repeated-read optimization instead of a speculative transport refactor.

## Next Decision

- The first optimization improved the lightweight MCP path enough to prove the transport work was not wasted.
- The next phase should continue on both tracks:
  - representative YNAB-backed tool latency
  - measurable transport-path overhead
- The next implementation plan should therefore:
  1. benchmark one representative YNAB-backed summary/read path on top of the new baseline
  2. benchmark one remaining transport-path hotspot on top of the new baseline
  3. optimize the hottest measured summary-tool hotspot
  4. optimize the hottest measured transport hotspot
  5. re-measure and choose the next slice from both tracks

## Follow-up Results

- Added a higher-level reliability seam so representative tool calls can be benchmarked through `runHttpReliabilityScenario(...)`.
- Added a transport baseline assertion proving the current sessionless path still creates one managed request per MCP POST.
- Optimized `ynab_get_monthly_review` anomaly generation by precomputing baseline category spending lookups instead of repeatedly scanning baseline category arrays.
- Optimized HTTP startup/request setup so one started HTTP server creates and reuses one configured YNAB API instance across sessionless MCP POSTs.
- Re-ran focused regression suites plus a lightweight local HTTP smoke run after the latest transport change.

## Updated Recommendation

- Keep the work dual-track.
- The next transport slice should focus on managed-request/server reuse or another way to remove per-POST runtime setup now that API reuse is in place.
- The next summary/tool slice should focus on another compact summary path with repeated scans, with `ynab_get_financial_health_check` currently the best candidate.
