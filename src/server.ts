import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import * as ynab from "ynab";

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

type ToolRegistrar = Pick<McpServer, "registerTool">;

function registerTool<Input>(
  registrar: ToolRegistrar,
  title: string,
  tool: {
    name: string;
    description: string;
    inputSchema: ZodRawShapeCompat;
    execute: (input: Input, api: ynab.API) => Promise<CallToolResult>;
  },
  api: ynab.API,
): string {
  registrar.registerTool(
    tool.name,
    {
      title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async (input: Input) => {
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

  return tool.name;
}

export function registerServerTools(registrar: ToolRegistrar, api: ynab.API): string[] {
  return [
    registerTool(registrar, "Get MCP Version", GetMcpVersionTool, api),
    registerTool(registrar, "Get User", GetUserTool, api),
    registerTool(registrar, "List Plans", ListPlansTool, api),
    registerTool(registrar, "Get Plan", GetPlanDetailsTool, api),
    registerTool(registrar, "Get Plan Settings", GetPlanSettingsTool, api),
    registerTool(registrar, "Get Plan Month", GetPlanMonthTool, api),
    registerTool(registrar, "List Plan Months", ListPlanMonthsTool, api),
    registerTool(registrar, "List Categories", ListPlanCategoriesTool, api),
    registerTool(registrar, "Get Category", GetCategoryTool, api),
    registerTool(registrar, "Get Month Category", GetMonthCategoryTool, api),
    registerTool(registrar, "List Transactions", ListTransactionsTool, api),
    registerTool(registrar, "Search Transactions", SearchTransactionsTool, api),
    registerTool(registrar, "Get Transactions By Month", GetTransactionsByMonthTool, api),
    registerTool(registrar, "Get Transaction", GetTransactionTool, api),
    registerTool(registrar, "Get Transactions By Account", GetTransactionsByAccountTool, api),
    registerTool(registrar, "Get Transactions By Category", GetTransactionsByCategoryTool, api),
    registerTool(registrar, "Get Transactions By Payee", GetTransactionsByPayeeTool, api),
    registerTool(registrar, "List Scheduled Transactions", ListScheduledTransactionsTool, api),
    registerTool(registrar, "Get Scheduled Transaction", GetScheduledTransactionTool, api),
    registerTool(registrar, "List Accounts", ListAccountsTool, api),
    registerTool(registrar, "Get Account", GetAccountTool, api),
    registerTool(registrar, "List Payees", ListPayeesTool, api),
    registerTool(registrar, "Get Payee", GetPayeeTool, api),
    registerTool(registrar, "List Payee Locations", ListPayeeLocationsTool, api),
    registerTool(registrar, "Get Payee Location", GetPayeeLocationTool, api),
    registerTool(registrar, "Get Payee Locations By Payee", GetPayeeLocationsByPayeeTool, api),
    registerTool(registrar, "Get Money Movements", GetMoneyMovementsTool, api),
    registerTool(registrar, "Get Money Movements By Month", GetMoneyMovementsByMonthTool, api),
    registerTool(registrar, "Get Money Movement Groups", GetMoneyMovementGroupsTool, api),
    registerTool(registrar, "Get Money Movement Groups By Month", GetMoneyMovementGroupsByMonthTool, api),
    registerTool(registrar, "Get Financial Snapshot", GetFinancialSnapshotTool, api),
    registerTool(registrar, "Get Financial Health Check", GetFinancialHealthCheckTool, api),
    registerTool(registrar, "Get Spending Summary", GetSpendingSummaryTool, api),
    registerTool(registrar, "Get Spending Anomalies", GetSpendingAnomaliesTool, api),
    registerTool(registrar, "Get Cash Flow Summary", GetCashFlowSummaryTool, api),
    registerTool(registrar, "Get Cash Runway", GetCashRunwayTool, api),
    registerTool(registrar, "Get Budget Health Summary", GetBudgetHealthSummaryTool, api),
    registerTool(registrar, "Get Upcoming Obligations", GetUpcomingObligationsTool, api),
    registerTool(registrar, "Get Goal Progress Summary", GetGoalProgressSummaryTool, api),
    registerTool(registrar, "Get Budget Cleanup Summary", GetBudgetCleanupSummaryTool, api),
    registerTool(registrar, "Get Income Summary", GetIncomeSummaryTool, api),
    registerTool(registrar, "Get Emergency Fund Coverage", GetEmergencyFundCoverageTool, api),
    registerTool(registrar, "Get Debt Summary", GetDebtSummaryTool, api),
    registerTool(registrar, "Get Recurring Expense Summary", GetRecurringExpenseSummaryTool, api),
    registerTool(registrar, "Get Category Trend Summary", GetCategoryTrendSummaryTool, api),
    registerTool(registrar, "Get 70/20/10 Summary", GetBudgetRatioSummaryTool, api),
  ];
}

export function createServer(config: YnabConfig, api = createYnabApi(config)): McpServer {
  const normalizedConfig = assertYnabConfig(config);
  const server = new McpServer(SERVER_INFO);
  const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);

  registerServerTools(server, configuredApi);

  return server;
}
