import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createServer, registerServerTools } from "./server.js";

describe("createServer", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("registers the rebuilt read-only YNAB toolset", () => {
    const server = createServer({
      apiToken: "test-token",
    });
    const registeredTools = Object.keys((server as any)._registeredTools);

    expect(registeredTools).toHaveLength(45);
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
        "ynab_search_transactions",
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
        "ynab_get_financial_snapshot",
        "ynab_get_financial_health_check",
        "ynab_get_spending_summary",
        "ynab_get_spending_anomalies",
        "ynab_get_cash_flow_summary",
        "ynab_get_cash_runway",
        "ynab_get_budget_health_summary",
        "ynab_get_upcoming_obligations",
        "ynab_get_goal_progress_summary",
        "ynab_get_budget_cleanup_summary",
        "ynab_get_income_summary",
        "ynab_get_emergency_fund_coverage",
        "ynab_get_debt_summary",
        "ynab_get_recurring_expense_summary",
        "ynab_get_category_trend_summary",
      ]),
    );
    expect(registeredTools).not.toContain("ynab_get_70_20_10_summary");
  });

  it("registers the toolset through a reusable SDK-native registrar", () => {
    const registerTool = vi.fn();

    const registeredToolNames = registerServerTools(
      {
        registerTool,
      },
      {} as any,
    );

    expect(registeredToolNames).toHaveLength(45);
    expect(registeredToolNames).toEqual([
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
      "ynab_search_transactions",
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
      "ynab_get_financial_snapshot",
      "ynab_get_financial_health_check",
      "ynab_get_spending_summary",
      "ynab_get_spending_anomalies",
      "ynab_get_cash_flow_summary",
      "ynab_get_cash_runway",
      "ynab_get_budget_health_summary",
      "ynab_get_upcoming_obligations",
      "ynab_get_goal_progress_summary",
      "ynab_get_budget_cleanup_summary",
      "ynab_get_income_summary",
      "ynab_get_emergency_fund_coverage",
      "ynab_get_debt_summary",
      "ynab_get_recurring_expense_summary",
      "ynab_get_category_trend_summary",
    ]);
    expect(registerTool).toHaveBeenCalledTimes(45);
    expect(registerTool).toHaveBeenCalledWith(
      "ynab_get_mcp_version",
      expect.objectContaining({
        title: "Get MCP Version",
        description: expect.any(String),
        inputSchema: expect.any(Object),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      }),
      expect.any(Function),
    );
    expect(registerTool).not.toHaveBeenCalledWith(
      "ynab_get_70_20_10_summary",
      expect.anything(),
      expect.any(Function),
    );
  });

  it("keeps registered MCP tool schemas serializable and their handlers callable through the registrar", async () => {
    const registerTool = vi.fn();
    const api = {
      months: {
        getPlanMonth: vi.fn(async (planId: string, month: string) => ({
          data: {
            month: {
              month,
              income: 120_000,
              budgeted: 100_000,
              activity: -90_000,
              to_be_budgeted: 30_000,
              age_of_money: 42,
              categories: [{ id: "category-1" }],
            },
          },
        })),
      },
      plans: {
        getPlans: vi.fn(async () => ({
          data: {
            plans: [{ id: "plan-1" }],
            default_plan: { id: "plan-1" },
          },
        })),
      },
    };

    registerServerTools(
      {
        registerTool,
      },
      api as any,
    );

    const planMonthRegistration = registerTool.mock.calls.find(
      ([toolName]) => toolName === "ynab_get_plan_month",
    );

    expect(planMonthRegistration).toBeDefined();

    const [, registration, handler] = planMonthRegistration!;
    expect(() => JSON.stringify(registration.inputSchema)).not.toThrow();

    const result = await handler({
      month: "2024-01-01",
    });

    expect(result).toEqual({
      content: [{
        type: "text",
        text: JSON.stringify({
          month: {
            month: "2024-01-01",
            income: 120_000,
            budgeted: 100_000,
            activity: -90_000,
            to_be_budgeted: 30_000,
            age_of_money: 42,
            category_count: 1,
          },
        }),
      }],
    });
    expect(api.months.getPlanMonth).toHaveBeenCalledWith("plan-1", "2024-01-01");
  });

  it("defines an explicit tool registry instead of passing whole tool modules around", () => {
    const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

    expect(source).toContain("name: GetMcpVersionTool.name");
    expect(source).toContain("executeTool(GetAccountTool.execute, api)");
    expect(source).not.toContain("module: GetAccountTool");
    expect(source).not.toContain("module.execute");
  });

  it("requires explicit config instead of reading the API token from environment", () => {
    process.env = { ...originalEnv, YNAB_API_TOKEN: "env-token" };

    expect(() => (createServer as any)()).toThrow("YNAB config is required.");
  });

  it("applies explicit plan config even when a custom API client is injected", async () => {
    const calls: Array<[string, ...string[]]> = [];
    const api = {
      plans: {
        getPlanById: async (planId: string) => {
          calls.push(["getPlanById", planId]);
          return {
            data: {
              plan: {
                id: planId,
              },
            },
          };
        },
        getPlans: async () => {
          calls.push(["getPlans"]);
          return {
            data: {
              plans: [
                { id: "plan-1" },
                { id: "plan-2" },
              ],
              default_plan: null,
            },
          };
        },
      },
    };

    const server = createServer({
      apiToken: "test-token",
      planId: "plan-1",
    }, api as any);

    const result = await (server as any)._registeredTools.ynab_get_plan.handler({});

    expect(JSON.parse(result.content[0].text)).toEqual({
      plan: {
        id: "plan-1",
      },
    });
    expect(calls).toEqual([
      ["getPlanById", "plan-1"],
    ]);
  });
});
