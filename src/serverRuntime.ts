/**
 * Owns: top-level MCP server creation, tool metadata definitions, ordered tool registration, and the logging-wrapped registrar loop.
 * Inputs/dependencies: validated YNAB config, YNAB API factory/runtime attachment, tool modules, request-context logging helpers, MCP registrar.
 * Outputs/contracts: defineTool(...), registerServerTools(...), and createServer(...).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { API } from "ynab";

import { assertYnabConfig, type YnabConfig } from "./config.js";
import { logAppEvent } from "./logger.js";
import { getPackageInfo } from "./packageInfo.js";
import { getRequestLogFields, markToolCallStarted } from "./requestContext.js";
import { attachYnabApiRuntimeContext, createYnabApi } from "./ynabApi.js";
import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetBudgetCleanupSummaryTool from "./tools/GetBudgetCleanupSummaryTool.js";
import * as GetBudgetRatioSummaryTool from "./tools/GetBudgetRatioSummaryTool.js";
import * as GetBudgetHealthSummaryTool from "./tools/GetBudgetHealthSummaryTool.js";
import * as GetCashRunwayTool from "./tools/GetCashRunwayTool.js";
import * as GetCashFlowSummaryTool from "./tools/GetCashFlowSummaryTool.js";
import * as GetCategoryTool from "./tools/GetCategoryTool.js";
import * as GetCategoryTrendSummaryTool from "./tools/GetCategoryTrendSummaryTool.js";
import * as GetDebtSummaryTool from "./tools/GetDebtSummaryTool.js";
import * as GetEmergencyFundCoverageTool from "./tools/GetEmergencyFundCoverageTool.js";
import * as GetFinancialHealthCheckTool from "./tools/GetFinancialHealthCheckTool.js";
import * as GetFinancialSnapshotTool from "./tools/GetFinancialSnapshotTool.js";
import * as GetGoalProgressSummaryTool from "./tools/GetGoalProgressSummaryTool.js";
import * as GetIncomeSummaryTool from "./tools/GetIncomeSummaryTool.js";
import * as GetMcpVersionTool from "./tools/GetMcpVersionTool.js";
import * as GetMoneyMovementGroupsTool from "./tools/GetMoneyMovementGroupsTool.js";
import * as GetMoneyMovementGroupsByMonthTool from "./tools/GetMoneyMovementGroupsByMonthTool.js";
import * as GetMoneyMovementsTool from "./tools/GetMoneyMovementsTool.js";
import * as GetMoneyMovementsByMonthTool from "./tools/GetMoneyMovementsByMonthTool.js";
import * as GetMonthCategoryTool from "./tools/GetMonthCategoryTool.js";
import * as GetPayeeLocationTool from "./tools/GetPayeeLocationTool.js";
import * as GetPayeeLocationsByPayeeTool from "./tools/GetPayeeLocationsByPayeeTool.js";
import * as GetPayeeTool from "./tools/GetPayeeTool.js";
import * as GetScheduledTransactionTool from "./tools/GetScheduledTransactionTool.js";
import * as SearchTransactionsTool from "./tools/SearchTransactionsTool.js";
import * as GetSpendingSummaryTool from "./tools/GetSpendingSummaryTool.js";
import * as GetSpendingAnomaliesTool from "./tools/GetSpendingAnomaliesTool.js";
import * as GetPlanDetailsTool from "./tools/GetPlanDetailsTool.js";
import * as GetPlanMonthTool from "./tools/GetPlanMonthTool.js";
import * as GetPlanSettingsTool from "./tools/GetPlanSettingsTool.js";
import * as GetTransactionTool from "./tools/GetTransactionTool.js";
import * as GetTransactionsByAccountTool from "./tools/GetTransactionsByAccountTool.js";
import * as GetTransactionsByCategoryTool from "./tools/GetTransactionsByCategoryTool.js";
import * as GetTransactionsByMonthTool from "./tools/GetTransactionsByMonthTool.js";
import * as GetTransactionsByPayeeTool from "./tools/GetTransactionsByPayeeTool.js";
import * as GetUpcomingObligationsTool from "./tools/GetUpcomingObligationsTool.js";
import * as GetUserTool from "./tools/GetUserTool.js";
import * as GetRecurringExpenseSummaryTool from "./tools/GetRecurringExpenseSummaryTool.js";
import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as ListPayeeLocationsTool from "./tools/ListPayeeLocationsTool.js";
import * as ListPlanMonthsTool from "./tools/ListPlanMonthsTool.js";
import * as ListPayeesTool from "./tools/ListPayeesTool.js";
import * as ListPlanCategoriesTool from "./tools/ListPlanCategoriesTool.js";
import * as ListPlansTool from "./tools/ListPlansTool.js";
import * as ListScheduledTransactionsTool from "./tools/ListScheduledTransactionsTool.js";
import * as ListTransactionsTool from "./tools/ListTransactionsTool.js";

const packageInfo = getPackageInfo();

const SERVER_INFO = {
  name: packageInfo.name,
  version: packageInfo.version,
} as const;

const READ_ONLY_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

type ToolModule = {
  title: string;
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: any, api: API) => Promise<CallToolResult>;
};

type ToolSource = Omit<ToolModule, "title">;
type ToolRegistrar = {
  registerTool: (...args: any[]) => unknown;
};

export function defineTool(title: string, tool: any): ToolModule {
  return {
    title,
    ...tool,
  } as ToolModule;
}

const toolRegistrations: ToolModule[] = [
  defineTool("Get MCP Version", GetMcpVersionTool),
  defineTool("Get User", GetUserTool),
  defineTool("List Plans", ListPlansTool),
  defineTool("Get Plan", GetPlanDetailsTool),
  defineTool("Get Plan Settings", GetPlanSettingsTool),
  defineTool("Get Plan Month", GetPlanMonthTool),
  defineTool("List Plan Months", ListPlanMonthsTool),
  defineTool("List Categories", ListPlanCategoriesTool),
  defineTool("Get Category", GetCategoryTool),
  defineTool("Get Month Category", GetMonthCategoryTool),
  defineTool("List Transactions", ListTransactionsTool),
  defineTool("Search Transactions", SearchTransactionsTool),
  defineTool("Get Transactions By Month", GetTransactionsByMonthTool),
  defineTool("Get Transaction", GetTransactionTool),
  defineTool("Get Transactions By Account", GetTransactionsByAccountTool),
  defineTool("Get Transactions By Category", GetTransactionsByCategoryTool),
  defineTool("Get Transactions By Payee", GetTransactionsByPayeeTool),
  defineTool("List Scheduled Transactions", ListScheduledTransactionsTool),
  defineTool("Get Scheduled Transaction", GetScheduledTransactionTool),
  defineTool("List Accounts", ListAccountsTool),
  defineTool("Get Account", GetAccountTool),
  defineTool("List Payees", ListPayeesTool),
  defineTool("Get Payee", GetPayeeTool),
  defineTool("List Payee Locations", ListPayeeLocationsTool),
  defineTool("Get Payee Location", GetPayeeLocationTool),
  defineTool("Get Payee Locations By Payee", GetPayeeLocationsByPayeeTool),
  defineTool("Get Money Movements", GetMoneyMovementsTool),
  defineTool("Get Money Movements By Month", GetMoneyMovementsByMonthTool),
  defineTool("Get Money Movement Groups", GetMoneyMovementGroupsTool),
  defineTool("Get Money Movement Groups By Month", GetMoneyMovementGroupsByMonthTool),
  defineTool("Get Financial Snapshot", GetFinancialSnapshotTool),
  defineTool("Get Financial Health Check", GetFinancialHealthCheckTool),
  defineTool("Get Spending Summary", GetSpendingSummaryTool),
  defineTool("Get Spending Anomalies", GetSpendingAnomaliesTool),
  defineTool("Get Cash Flow Summary", GetCashFlowSummaryTool),
  defineTool("Get Cash Runway", GetCashRunwayTool),
  defineTool("Get Budget Health Summary", GetBudgetHealthSummaryTool),
  defineTool("Get Upcoming Obligations", GetUpcomingObligationsTool),
  defineTool("Get Goal Progress Summary", GetGoalProgressSummaryTool),
  defineTool("Get Budget Cleanup Summary", GetBudgetCleanupSummaryTool),
  defineTool("Get Income Summary", GetIncomeSummaryTool),
  defineTool("Get Emergency Fund Coverage", GetEmergencyFundCoverageTool),
  defineTool("Get Debt Summary", GetDebtSummaryTool),
  defineTool("Get Recurring Expense Summary", GetRecurringExpenseSummaryTool),
  defineTool("Get Category Trend Summary", GetCategoryTrendSummaryTool),
  defineTool("Get 70/20/10 Summary", GetBudgetRatioSummaryTool),
];

function registerTool(registrar: ToolRegistrar, tool: ToolModule, api: API) {
  registrar.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async (input: unknown) => {
      markToolCallStarted();
      logAppEvent("mcp", "tool.call.started", {
        ...getRequestLogFields(),
        toolName: tool.name,
      });

      try {
        const result = await tool.execute(input, api);
        const failed = "isError" in result && result.isError === true;

        logAppEvent("mcp", failed ? "tool.call.failed" : "tool.call.succeeded", {
          ...getRequestLogFields(),
          toolName: tool.name,
        });

        return result;
      } catch (error) {
        logAppEvent("mcp", "tool.call.failed", {
          ...getRequestLogFields(),
          error,
          toolName: tool.name,
        });
        throw error;
      }
    },
  );
}

export function registerServerTools(registrar: ToolRegistrar, api: API) {
  const registeredToolNames: string[] = [];

  for (const tool of toolRegistrations) {
    registerTool(registrar, tool, api);
    registeredToolNames.push(tool.name);
  }

  return registeredToolNames;
}

export function createServer(config: YnabConfig, api = createYnabApi(config)) {
  const normalizedConfig = assertYnabConfig(config);
  const server = new McpServer(SERVER_INFO);
  const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);

  registerServerTools(server as unknown as ToolRegistrar, configuredApi);

  return server;
}
