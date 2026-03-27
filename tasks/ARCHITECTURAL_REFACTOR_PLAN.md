# Architectural Refactor Plan

## Goals

- Restore build health and remove accidental config duplication.
- Make startup and transport wiring use explicit app configuration.
- Remove cross-request module-global state from plan resolution.
- Return MCP tool failures as proper error results.
- Isolate YNAB SDK private-internal usage behind a narrow adapter boundary.
- Enforce build and test checks in CI.

## Work Items

1. Consolidate config parsing in `src/config.ts`.
2. Thread `AppConfig` explicitly from `src/index.ts` into HTTP and stdio startup.
3. Attach YNAB runtime metadata to each API instance instead of reading `process.env` from tools.
4. Refactor plan resolution to use API-scoped state instead of module-global state.
5. Mark tool error results with `isError: true`.
6. Tighten the YNAB adapter boundary in `src/ynabApi.ts`.
7. Update affected tests and add CI coverage for `npm test` plus `npm run build`.

## Verification

- `npm test`
- `npm run build`
