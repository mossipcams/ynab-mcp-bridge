# SDK Upgrade And Rebuild Plan

Scope: rebuild the MCP surface around the newer YNAB SDK and expose a read-only, budgeting-focused toolset aligned to `plans`.

## Tasks

1. Upgrade the SDK and capture the new contract
- Add a lightweight SDK contract spec outside `tests/`.
- Upgrade `ynab` to `^4.0.0`.
- Verify with the contract spec and a build.

2. Rebuild the shared YNAB client wrapper around `plans`
- Add shared helpers for `planId` resolution and error formatting.
- Add a compatibility wrapper so legacy source files can still compile while the new MCP surface is rebuilt.
- Verify with targeted specs and a build.

3. Rebuild the MCP registration around the new tool set
- Replace the old server registrations with a read-only, plan-aligned tool list.
- Verify with the server registration and HTTP tests.

4. Rebuild the base read-only plan tools
- Implement `ListPlans` and `GetPlanDetails`.
- Verify with dedicated plan-read tool specs.

5. Rebuild plan settings and month snapshot tools
- Implement `GetPlanSettings` and `GetPlanMonth`.
- Verify with dedicated plan-read tool specs.

6. Rebuild category drill-down tools for budgeting
- Implement `ListCategories`, `GetCategory`, and `GetMonthCategory`.
- Verify with dedicated read-only tool specs.

7. Rebuild month-scoped transaction analysis
- Implement `GetTransactionsByMonth`.
- Verify with dedicated read-only tool specs.

8. Rebuild optional read-only drill-down tools
- Implement `GetAccount` and `GetPayee`.
- Verify with dedicated read-only tool specs.

9. Add money movement read tools unlocked by SDK v4
- Implement `GetMoneyMovementsByMonth` and `GetMoneyMovementGroupsByMonth`.
- Verify with dedicated read-only tool specs.

10. Final verification and cleanup
- Run targeted specs, then the full test suite and build.
- Keep the implementation aligned to `plans` terminology and the newer SDK surface.
