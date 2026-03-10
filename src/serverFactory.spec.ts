import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";

describe("createServer", () => {
  it("registers the rebuilt read-only YNAB toolset", () => {
    const server = createServer();
    const registeredTools = Object.keys((server as any)._registeredTools);

    expect(registeredTools).toHaveLength(29);
    expect(registeredTools).toEqual(
      expect.arrayContaining([
        "ynab_get_mcp_version",
        "ynab_get_user",
        "ynab_list_plans",
        "ynab_get_plan",
        "ynab_get_plan_settings",
        "ynab_get_plan_month",
        "ynab_list_plan_months",
        "ynab_list_categories",
        "ynab_get_category",
        "ynab_get_month_category",
        "ynab_list_transactions",
        "ynab_get_transactions_by_month",
        "ynab_get_transaction",
        "ynab_get_transactions_by_account",
        "ynab_get_transactions_by_category",
        "ynab_get_transactions_by_payee",
        "ynab_list_scheduled_transactions",
        "ynab_get_scheduled_transaction",
        "ynab_list_accounts",
        "ynab_get_account",
        "ynab_list_payees",
        "ynab_get_payee",
        "ynab_list_payee_locations",
        "ynab_get_payee_location",
        "ynab_get_payee_locations_by_payee",
        "ynab_get_money_movements",
        "ynab_get_money_movements_by_month",
        "ynab_get_money_movement_groups",
        "ynab_get_money_movement_groups_by_month",
      ]),
    );
  });
});
