import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";

describe("createServer", () => {
  it("registers the full YNAB toolset", () => {
    const server = createServer();
    const registeredTools = Object.keys((server as any)._registeredTools);

    expect(registeredTools).toHaveLength(16);
    expect(registeredTools).toEqual(
      expect.arrayContaining([
        "ynab_list_budgets",
        "ynab_budget_summary",
        "ynab_get_unapproved_transactions",
        "ynab_create_transaction",
        "ynab_approve_transaction",
        "ynab_update_category_budget",
        "ynab_update_transaction",
        "ynab_bulk_approve_transactions",
        "ynab_list_payees",
        "ynab_get_transactions",
        "ynab_delete_transaction",
        "ynab_list_categories",
        "ynab_list_accounts",
        "ynab_list_scheduled_transactions",
        "ynab_import_transactions",
        "ynab_list_months",
      ]),
    );
  });
});
