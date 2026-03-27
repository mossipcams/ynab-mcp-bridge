# MCP Performance Optimization TDD Plan

## Position In The Roadmap

This is the **second-step execution plan** derived from `tasks/performance-optimization-plan.md`.

Use this file only after the primary performance plan has established the benchmark-first direction and confirmed that Plan B remains the right target:

1. Measure representative YNAB-backed tool latency first
2. Confirm the biggest wins are in tool/data-path work
3. Then execute the TDD slices below

## Goals

- Reduce tool-call latency for large YNAB plans.
- Reduce repeated bridge-side overhead on proven hot paths.
- Continue improving HTTP connection/setup work alongside tool-path work when the transport hotspot is measurable and justified.
- Preserve current behavior and compatibility while improving speed.
- Add measurements so regressions are visible in CI or local verification.

## Scope
- Transaction listing/search tool performance.
- Shared plan-resolution and metadata lookup overhead.
- Heavy summary tool data-fetch patterns.
- HTTP transport connection and request lifecycle as an active optimization track when the hotspot is measurable.
- Logging/debug overhead on the request path.

## Non-Goals

- Changing tool outputs unless required for correctness or pagination metadata.
- Reworking OAuth flows beyond performance-related request-path overhead.
- Changing tests in `tests/` directory.

## Proposed Order

- Treat the benchmark-first work in `tasks/performance-optimization-plan.md` as the prerequisite.
- Start with shared lookup overhead and the highest-volume YNAB-backed tool paths.
- Tackle broad summary-tool fetch patterns after shared caching/helpers exist.
- Keep transport/logging cleanup active when the measurements justify it; do not treat it as mutually exclusive with tool-path work.

## Prerequisite

- The benchmark-first slice from `tasks/performance-optimization-plan.md` has been completed enough to justify entering this execution plan.

## Task 1: Cache resolved plan selection on the shared API/runtime path

- [ ] Test to write
  - Add a spec for `withResolvedPlan` proving repeated tool calls without explicit `planId` do not repeatedly call `plans.getPlans()`.
  - Add a regression spec proving cache invalidation/fallback still works when the configured/default plan is missing.
- [ ] Code to implement
  - Introduce a small cache for resolved/default plan ID at the API runtime-context layer or plan utility layer.
  - Preserve current fallback and missing-plan recovery behavior.
- [ ] How to verify
  - Run the new plan utility specs.
  - Run a small targeted benchmark/mock-based assertion showing `getPlans()` call count drops across repeated invocations.

## Task 2: Push pagination and filtering earlier for transaction collection tools

- [ ] Test to write
  - Add transaction collection specs proving pagination metadata and returned rows remain correct for `ynab_list_transactions`.
  - Add search tool specs proving `limit`, `offset`, `sort`, and filters still behave correctly on large mocked transaction sets.
  - Add at least one regression spec that guards against eagerly formatting/projecting every transaction before pagination.
- [ ] Code to implement
  - Refactor transaction collection/search helpers so they avoid unnecessary full-array transforms before pagination.
  - Where the upstream SDK allows narrower fetches, use them; otherwise minimize local sort/filter/format work and duplicate passes.
- [ ] How to verify
  - Run targeted transaction tool specs.
  - Compare local timing on large mocked datasets before and after.
  - Re-run smoke checks to ensure no contract regressions.

## Task 3: Add shared cached snapshots for low-churn reference data

- [ ] Test to write
  - Add specs for shared caching of categories, months, accounts, and scheduled transactions proving repeated tool calls reuse cached data within the intended scope.
  - Add regression specs for cache miss/refresh paths and for distinct `planId` separation.
- [ ] Code to implement
  - Add narrowly scoped cache helpers with clear TTL or lifecycle behavior.
  - Wire heavy read-only summary tools to the shared cache helpers instead of issuing duplicate upstream requests.
- [ ] How to verify
  - Run targeted cache and tool specs.
  - Verify request counts against mocked YNAB APIs drop for repeated tool calls.
  - Spot-check that returned payloads are unchanged.

## Task 4: Refactor heavy summary tools to use narrower data paths

- [ ] Test to write
  - Add or extend specs for `ynab_get_financial_health_check`, `ynab_get_monthly_review`, `ynab_get_spending_summary`, `ynab_get_cash_flow_summary`, `ynab_get_income_summary`, and `ynab_get_recurring_expense_summary`.
  - Focus assertions on output stability plus expected upstream call counts for representative scenarios.
- [ ] Code to implement
  - Replace broad fetch-and-trim patterns with cached metadata, narrower date windows, and shared rollup helpers.
  - Consolidate duplicated rollup logic where it reduces passes over large datasets.
- [ ] How to verify
  - Run the targeted summary-tool specs.
  - Use mocked large-plan scenarios to confirm lower upstream call counts and lower local processing work.
  - Re-run smoke checks for compatibility.

## Task 5: Remove avoidable HTTP connection round trips

- [ ] Test to write
  - Add an HTTP transport spec that simulates the SDK client connect flow and proves the server handles the client’s connection probing pattern without unnecessary rejection noise or extra work.
  - Add a regression spec for whatever `/mcp` non-POST behavior we choose to support, so the contract is explicit.
- [ ] Code to implement
  - Adjust HTTP transport request handling so common MCP client connection probing is handled more efficiently.
  - Keep MCP semantics correct while reducing wasted work during connect/initialize.
- [ ] How to verify
  - Run the new transport spec.
  - Re-run the HTTP smoke probe and compare `initialize` latency and request count/log volume versus the earlier benchmark.

## Task 6: Avoid per-request MCP server setup work when possible

- [ ] Test to write
  - Add a spec around HTTP managed-request creation that proves repeated requests do not redo unnecessary setup work.
  - Add a regression spec covering request isolation so any reuse strategy does not leak state across requests.
- [ ] Code to implement
  - Refactor managed request/server setup to reuse immutable registration work where safe.
  - Preserve request-specific state and cleanup behavior.
- [ ] How to verify
  - Run the new HTTP transport specs.
  - Re-run the reliability smoke probe and compare `initialize` and `tools/list` timings against the earlier benchmark.
  - Manually inspect that tool/resource registration counts remain correct.

## Task 7: Gate expensive response-capture and debug logging off the hot path if needed

- [ ] Test to write
  - Add an HTTP transport spec proving validation/error diagnostics still work when response capture is disabled by default or only enabled in the needed cases.
  - Add a logger-focused spec proving redaction behavior remains correct after any fast-path changes.
- [ ] Code to implement
  - Reduce or gate response body capture for tool calls so successful requests do not always pay buffer/parse overhead.
  - Reduce avoidable logging overhead on the hot path while preserving useful operational logs.
- [ ] How to verify
  - Run targeted transport and logger specs.
  - Re-run the local HTTP smoke probe and compare tail latencies against prior tasks.
  - Inspect logs manually to confirm important events still appear and secrets remain redacted.

## Task 8: Final end-to-end verification and regression check

- [ ] Test to write
  - Add or update a high-level performance/regression spec only if needed to lock in the final architecture choices.
  - Prefer focused regression tests over brittle timing assertions.
- [ ] Code to implement
  - Only small cleanup/refactor work needed to keep the final design coherent.
  - No behavior changes unless verification exposes a correctness issue.
- [ ] How to verify
  - Run the full relevant spec set for touched files.
  - Run the HTTP smoke reliability scenario and compare against the benchmark established from the primary performance plan.
  - Verify the final change list would meet a staff engineer review bar: correctness, simplicity, observability, and clear performance wins.

## Suggested Verification Commands

```bash
npm run test -- src/httpTransport.spec.ts
npm run test -- src/serverRuntime.spec.ts
npm run test -- src/transactionToolFamily.spec.ts
npm run test -- src/financeSummaryTools.spec.ts
npm run test -- src/reliabilityHttp.spec.ts
node --input-type=module -e "import { startHttpServer } from './dist/httpTransport.js'; import { runHttpReliabilityScenario } from './dist/reliabilityHttp.js'; import { setLoggerDestinationForTests } from './dist/logger.js'; setLoggerDestinationForTests({ write() { return true; } }); const server = await startHttpServer({ host: '127.0.0.1', port: 0, path: '/mcp', ynab: { apiToken: 'test-token' } }); try { const result = await runHttpReliabilityScenario({ url: server.url, concurrency: 1, requestCount: 20, maxErrorRate: 0, ynab: { apiToken: 'test-token' } }); console.log(JSON.stringify(result.summary, null, 2)); } finally { await server.close(); }"
```

## Expected Wins

- Lower memory use and faster response times on transaction-heavy tools.
- Fewer upstream YNAB API calls for repeated plan/category/month/account lookups.
- Lower latency for heavy summary tools through narrower data paths and shared caches.
- Lower `initialize` and `tools/list` latency through continued transport work where the hotspot remains measurable.
- Better confidence in future performance work because the baseline and regression checks are explicit.

## Results

- Primary roadmap lives in `tasks/performance-optimization-plan.md`.
- This file is the second-step execution plan for the MCP-focused implementation slices.
- Completed in this slice:
  - representative tool-call benchmarking now flows through the higher-level reliability scenario runner
  - transport baseline coverage exists for managed-request creation per MCP POST
  - `ynab_get_monthly_review` anomaly generation avoids repeated baseline category scans
  - HTTP startup now reuses one configured API instance across sessionless MCP POSTs
- Remaining likely next slices:
  - managed-request/server reuse on the transport path
  - another repeated-scan summary tool such as `ynab_get_financial_health_check`
