import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";

import { setLoggerDestinationForTests } from "./logger.js";
import { runWithRequestContext } from "./requestContext.js";
import {
  createServer,
  defineTool,
  getDiscoveryResourceDocument,
  getDiscoveryResourceSummaries,
  getToolsListResult,
  registerServerTools,
} from "./serverRuntime.js";
import { attachYnabApiRuntimeContext } from "./ynabApi.js";
import * as GetMcpVersionTool from "./tools/GetMcpVersionTool.js";

describe("createServer", () => {
  const originalEnv = process.env;
  const expectedToolNames = [
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
    "ynab_get_monthly_review",
    "ynab_get_net_worth_trajectory",
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
  ] as const;

  function createBufferedDestination() {
    const destination = new PassThrough();
    const chunks: string[] = [];

    destination.on("data", (chunk) => {
      chunks.push(chunk.toString("utf8"));
    });

    return {
      destination,
      readEntries() {
        return chunks
          .join("")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Record<string, unknown>);
      },
    };
  }

  function createRegisteredHandlers(
    api: unknown = {},
    config: Parameters<typeof attachYnabApiRuntimeContext>[1] = {
      apiToken: "test-token",
    },
  ) {
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();

    registerServerTools(
      {
        registerTool: ((name: string, _metadata: unknown, handler: (input: unknown) => Promise<unknown>) => {
          handlers.set(name, handler);
          return {};
        }) as never,
      },
      attachYnabApiRuntimeContext(api, config) as never,
    );

    return handlers;
  }

  function getToolDocument(
    toolName: string,
    options: Parameters<typeof getDiscoveryResourceSummaries>[0] = {},
  ) {
    const summary = getDiscoveryResourceSummaries(options).find((resource) => resource.name === toolName);

    expect(summary).toBeDefined();

    return getDiscoveryResourceDocument(toolName, summary!.uri, options);
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setLoggerDestinationForTests();
  });

  it("registers the rebuilt read-only YNAB toolset", () => {
    const registeredTools = getToolsListResult().tools.map((tool) => tool.name);

    expect(registeredTools).toHaveLength(47);
    expect(registeredTools).toEqual(expect.arrayContaining(expectedToolNames));
  });

  it("advertises discovery resources for callable YNAB tools", () => {
    const server = createServer({
      apiToken: "test-token",
    });

    expect(server.server.getCapabilities()).toEqual(expect.objectContaining({
      resources: {
        listChanged: true,
      },
    }));

    const registeredResources = getDiscoveryResourceSummaries();

    expect(registeredResources.length).toBeGreaterThan(0);
    expect(registeredResources.map((resource) => resource.name)).toEqual(expect.arrayContaining([
      "ynab_list_categories",
      "ynab_list_accounts",
    ]));
  });

  it("serializes readable discovery metadata for affected YNAB tools", () => {
    const categoryPayload = getToolDocument("ynab_list_categories");
    const accountPayload = getToolDocument("ynab_list_accounts");

    expect(categoryPayload).toEqual(expect.objectContaining({
      annotations: expect.objectContaining({
        readOnlyHint: true,
      }),
      inputSchema: expect.anything(),
      title: "List Categories",
      toolName: "ynab_list_categories",
    }));
    expect(accountPayload).toEqual(expect.objectContaining({
      annotations: expect.objectContaining({
        readOnlyHint: true,
      }),
      inputSchema: expect.anything(),
      title: "List Accounts",
      toolName: "ynab_list_accounts",
    }));
  });

  it("reuses compact JSON Schema in discovery documents instead of raw zod internals", () => {
    const searchDocument = getDiscoveryResourceDocument(
      "ynab_search_transactions",
      "ynab-tool://ynab_search_transactions",
    ) as Record<string, unknown>;
    const searchTool = getToolsListResult().tools.find((tool) => tool.name === "ynab_search_transactions");

    expect(searchTool).toBeDefined();
    expect(searchDocument["inputSchema"]).toEqual(searchTool!.inputSchema);
    expect(JSON.stringify(searchDocument["inputSchema"])).not.toContain("\"_def\"");
  });

  it("registers a compatibility URI alias for each discovery resource without changing its metadata contract", () => {
    const options = {
      discoveryResourceBaseUrl: "https://mcp.example.com/mcp/resources/",
    };
    const categoryEntries = getDiscoveryResourceSummaries(options)
      .filter((resource) => resource.name === "ynab_list_categories");

    expect(categoryEntries.map((resource) => resource.uri)).toEqual(expect.arrayContaining([
      "ynab-tool://ynab_list_categories",
      "https://mcp.example.com/mcp/resources/ynab_list_categories",
    ]));

    const payloads = categoryEntries.map((resource) => (
      getDiscoveryResourceDocument("ynab_list_categories", resource.uri, options) as Record<string, unknown>
    ));

    expect(payloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "List Categories",
        toolName: "ynab_list_categories",
      }),
    ]));
    expect(new Set(payloads.map((payload) => JSON.stringify({
      annotations: payload.annotations,
      argumentExamples: payload.argumentExamples,
      description: payload.description,
      inputSchema: payload.inputSchema,
      invocationExample: payload.invocationExample,
      requiredArguments: payload.requiredArguments,
      title: payload.title,
      toolName: payload.toolName,
    })))).toHaveLength(1);
  });

  it("can advertise compatibility discovery URLs without duplicate aliases", () => {
    const options = {
      discoveryResourceBaseUrl: "https://mcp.example.com/mcp/resources/",
      discoveryResourceUriMode: "compatibility-only" as const,
    };
    const summaries = getDiscoveryResourceSummaries(options);

    expect(new Set(summaries.map((summary) => summary.name)).size).toBe(47);
    expect(summaries).toHaveLength(47);
    expect(summaries.every((summary) => summary.uri.startsWith("https://mcp.example.com/mcp/resources/"))).toBe(true);

    const categoryEntries = summaries.filter((summary) => summary.name === "ynab_list_categories");

    expect(categoryEntries.map((summary) => summary.uri)).toEqual([
      "https://mcp.example.com/mcp/resources/ynab_list_categories",
    ]);

    const directPayload = getDiscoveryResourceDocument(
      "ynab_list_categories",
      categoryEntries[0]!.uri,
      options,
    ) as Record<string, unknown>;
    const canonicalPayload = getDiscoveryResourceDocument(
      "ynab_list_categories",
      "ynab-tool://ynab_list_categories",
      options,
    ) as Record<string, unknown>;

    expect(directPayload).toEqual(expect.objectContaining({
      title: "List Categories",
      toolName: "ynab_list_categories",
    }));
    expect(canonicalPayload).toEqual(expect.objectContaining({
      title: "List Categories",
      toolName: "ynab_list_categories",
    }));
  });

  it("adds explicit required-argument guidance for strict-input discovery tools", () => {
    const strictToolNames = [
      "ynab_get_month_category",
      "ynab_get_net_worth_trajectory",
      "ynab_get_spending_anomalies",
    ] as const;

    for (const toolName of strictToolNames) {
      const payload = getToolDocument(toolName);

      expect(payload).toEqual(expect.objectContaining({
        toolName,
        requiredArguments: expect.any(Array),
        argumentExamples: expect.any(Object),
        invocationExample: expect.any(Object),
      }));
    }

    const monthCategoryPayload = getToolDocument("ynab_get_month_category");

    expect(monthCategoryPayload.requiredArguments).toEqual(["month", "categoryId"]);
    expect(monthCategoryPayload.argumentExamples).toEqual(expect.objectContaining({
      month: "2026-03-01",
      categoryId: "category-123",
    }));
  });

  it("reuses cached discovery summaries and documents for repeated base-url lookups", () => {
    const options = {
      discoveryResourceBaseUrl: "https://mcp.example.com/mcp/resources/",
    };

    const firstSummaries = getDiscoveryResourceSummaries(options);
    const secondSummaries = getDiscoveryResourceSummaries(options);

    expect(firstSummaries).toBe(secondSummaries);

    const categorySummary = firstSummaries.find((summary) => summary.name === "ynab_list_categories" && summary.uri.startsWith("https://"));
    expect(categorySummary).toBeDefined();

    const firstDocument = getDiscoveryResourceDocument("ynab_list_categories", categorySummary!.uri, options);
    const secondDocument = getDiscoveryResourceDocument("ynab_list_categories", categorySummary!.uri, options);

    expect(firstDocument).toBe(secondDocument);
  });

  it("uses concrete date and id examples for the remaining flaky discovery tools", () => {
    const monthCategoryPayload = getToolDocument("ynab_get_month_category");
    const netWorthPayload = getToolDocument("ynab_get_net_worth_trajectory");
    const payeeLocationPayload = getToolDocument("ynab_get_payee_location");

    expect(monthCategoryPayload.invocationExample).toEqual({
      month: "2026-03-01",
      categoryId: "category-123",
      view: "compact",
    });
    expect(netWorthPayload.argumentExamples).toEqual({
      fromMonth: "2026-01-01",
      toMonth: "2026-03-01",
    });
    expect(netWorthPayload.invocationExample).toEqual({
      fromMonth: "2026-01-01",
      toMonth: "2026-03-01",
    });
    expect(payeeLocationPayload).toEqual(expect.objectContaining({
      toolName: "ynab_get_payee_location",
      requiredArguments: ["payeeLocationId"],
      argumentExamples: {
        payeeLocationId: "payee-location-123",
      },
      invocationExample: {
        payeeLocationId: "payee-location-123",
      },
    }));
  });

  it("registers the toolset through a reusable SDK-native registrar", () => {
    const registerTool = vi.fn();

    const registeredToolNames = registerServerTools(
      {
        registerTool,
      },
      {} as any,
    );

    expect(registeredToolNames).toHaveLength(47);
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
      "ynab_get_monthly_review",
      "ynab_get_net_worth_trajectory",
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
    expect(registerTool).toHaveBeenCalledTimes(47);
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
  });

  it("logs tool lifecycle events with request correlation for success and failure", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

    const registeredHandlers = new Map<string, (input: unknown) => Promise<unknown>>();

    registerServerTools(
      {
        registerTool: ((name: string, _metadata: unknown, handler: (input: unknown) => Promise<unknown>) => {
          registeredHandlers.set(name, handler as (input: unknown) => Promise<unknown>);
          return {} as any;
        }) as any,
      },
      {} as any,
    );

    await runWithRequestContext({
      correlationId: "corr-tool-success-123",
      requestId: "req-tool-success-123",
    }, async () => {
      await registeredHandlers.get("ynab_get_mcp_version")?.({});
    });

    const failedResult = await runWithRequestContext({
      correlationId: "corr-tool-failure-123",
      requestId: "req-tool-failure-123",
    }, async () => {
      return await registeredHandlers.get("ynab_get_user")?.({});
    });

    expect(failedResult).toMatchObject({
      isError: true,
    });

    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        correlationId: "corr-tool-success-123",
        event: "tool.call.started",
        requestId: "req-tool-success-123",
        scope: "mcp",
        toolName: "ynab_get_mcp_version",
      }),
      expect.objectContaining({
        correlationId: "corr-tool-success-123",
        event: "tool.call.succeeded",
        requestId: "req-tool-success-123",
        scope: "mcp",
        toolName: "ynab_get_mcp_version",
      }),
      expect.objectContaining({
        correlationId: "corr-tool-failure-123",
        event: "tool.call.failed",
        requestId: "req-tool-failure-123",
        scope: "mcp",
        toolName: "ynab_get_user",
      }),
    ]));
  });

  it("does not let one tool call's dynamic plan resolution bleed into the next call", async () => {
    const registeredHandlers = new Map<string, (input: unknown) => Promise<unknown>>();
    let availablePlanIds = ["plan-a"];
    const api = attachYnabApiRuntimeContext({
      plans: {
        async getPlanById(planId: string) {
          return {
            data: {
              plan: {
                id: planId,
                name: `Plan ${planId}`,
                last_modified_on: "2026-03-25T00:00:00.000Z",
              },
            },
          };
        },
        async getPlans() {
          return {
            data: {
              plans: availablePlanIds.map((id) => ({ id })),
              default_plan: { id: availablePlanIds[0] },
            },
          };
        },
      },
    }, {
      apiToken: "test-token",
    });

    registerServerTools(
      {
        registerTool: ((name: string, _metadata: unknown, handler: (input: unknown) => Promise<unknown>) => {
          registeredHandlers.set(name, handler as (input: unknown) => Promise<unknown>);
          return {} as any;
        }) as any,
      },
      api as any,
    );

    const firstResult = await registeredHandlers.get("ynab_get_plan")?.({});
    availablePlanIds = ["plan-b"];
    const secondResult = await registeredHandlers.get("ynab_get_plan")?.({});

    expect(JSON.parse((firstResult as { content: Array<{ text: string }> }).content[0].text)).toEqual({
      plan: {
        id: "plan-a",
        last_modified_on: "2026-03-25T00:00:00.000Z",
        name: "Plan plan-a",
      },
    });
    expect(JSON.parse((secondResult as { content: Array<{ text: string }> }).content[0].text)).toEqual({
      plan: {
        id: "plan-b",
        last_modified_on: "2026-03-25T00:00:00.000Z",
        name: "Plan plan-b",
      },
    });
  });

  it("builds reusable tool definitions from tool modules", () => {
    expect(defineTool("Get MCP Version", GetMcpVersionTool)).toEqual({
      description: GetMcpVersionTool.description,
      execute: GetMcpVersionTool.execute,
      inputSchema: GetMcpVersionTool.inputSchema,
      name: GetMcpVersionTool.name,
      title: "Get MCP Version",
    });
  });

  it("keeps the tool registry names aligned between the reusable builder and the exported catalog", () => {
    const builtTool = defineTool("Get MCP Version", GetMcpVersionTool);
    const exportedTool = getToolsListResult().tools.find((tool) => tool.name === builtTool.name);

    expect(exportedTool).toEqual(expect.objectContaining({
      description: builtTool.description,
      name: builtTool.name,
      title: builtTool.title,
    }));
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

    const handlers = createRegisteredHandlers(api, {
      apiToken: "test-token",
      planId: "plan-1",
    });
    const result = await handlers.get("ynab_get_plan")?.({});

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
