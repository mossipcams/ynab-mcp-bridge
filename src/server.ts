import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as ynab from "ynab";

import { assertYnabConfig, type YnabConfig } from "./config.js";
import { getPackageInfo } from "./packageInfo.js";
import { attachYnabApiRuntimeContext, createYnabApi } from "./ynabApi.js";
import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetBudgetCleanupSummaryTool from "./tools/GetBudgetCleanupSummaryTool.js";
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

type ToolRegistration = {
  name: string;
  register: (registrar: ToolRegistrar, api: ynab.API) => void;
  title: string;
};

type ToolRegistrar = {
  registerTool: (
    name: string,
    config: {
      annotations?: unknown;
      description?: string;
      inputSchema?: unknown;
      title?: string;
    },
    cb: (input: Record<string, unknown>) => unknown,
  ) => unknown;
};

function stripUndefinedProperties(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function executeTool<TResult>(
  execute: (input: never, api: ynab.API) => TResult,
  api: ynab.API,
): (input: Record<string, unknown>) => TResult {
  return (input: Record<string, unknown>): TResult => {
    const sanitizedInput = stripUndefinedProperties(input);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP validates tool input before invocation.
    return execute(sanitizedInput as never, api);
  };
}

const toolRegistrations: ToolRegistration[] = [
  {
    title: "Get MCP Version",
    name: GetMcpVersionTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetMcpVersionTool.name, {
        title: "Get MCP Version",
        description: GetMcpVersionTool.description,
        inputSchema: GetMcpVersionTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetMcpVersionTool.execute, api));
    },
  },
  {
    title: "Get User",
    name: GetUserTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetUserTool.name, {
        title: "Get User",
        description: GetUserTool.description,
        inputSchema: GetUserTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetUserTool.execute, api));
    },
  },
  {
    title: "List Plans",
    name: ListPlansTool.name,
    register: (registrar, api) => {
      registrar.registerTool(ListPlansTool.name, {
        title: "List Plans",
        description: ListPlansTool.description,
        inputSchema: ListPlansTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(ListPlansTool.execute, api));
    },
  },
  {
    title: "Get Plan",
    name: GetPlanDetailsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetPlanDetailsTool.name, {
        title: "Get Plan",
        description: GetPlanDetailsTool.description,
        inputSchema: GetPlanDetailsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetPlanDetailsTool.execute, api));
    },
  },
  {
    title: "Get Plan Settings",
    name: GetPlanSettingsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetPlanSettingsTool.name, {
        title: "Get Plan Settings",
        description: GetPlanSettingsTool.description,
        inputSchema: GetPlanSettingsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetPlanSettingsTool.execute, api));
    },
  },
  {
    title: "Get Plan Month",
    name: GetPlanMonthTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetPlanMonthTool.name, {
        title: "Get Plan Month",
        description: GetPlanMonthTool.description,
        inputSchema: GetPlanMonthTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetPlanMonthTool.execute, api));
    },
  },
  {
    title: "List Plan Months",
    name: ListPlanMonthsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(ListPlanMonthsTool.name, {
        title: "List Plan Months",
        description: ListPlanMonthsTool.description,
        inputSchema: ListPlanMonthsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(ListPlanMonthsTool.execute, api));
    },
  },
  {
    title: "List Categories",
    name: ListPlanCategoriesTool.name,
    register: (registrar, api) => {
      registrar.registerTool(ListPlanCategoriesTool.name, {
        title: "List Categories",
        description: ListPlanCategoriesTool.description,
        inputSchema: ListPlanCategoriesTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(ListPlanCategoriesTool.execute, api));
    },
  },
  {
    title: "Get Category",
    name: GetCategoryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetCategoryTool.name, {
        title: "Get Category",
        description: GetCategoryTool.description,
        inputSchema: GetCategoryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetCategoryTool.execute, api));
    },
  },
  {
    title: "Get Month Category",
    name: GetMonthCategoryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetMonthCategoryTool.name, {
        title: "Get Month Category",
        description: GetMonthCategoryTool.description,
        inputSchema: GetMonthCategoryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetMonthCategoryTool.execute, api));
    },
  },
  {
    title: "List Transactions",
    name: ListTransactionsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(ListTransactionsTool.name, {
        title: "List Transactions",
        description: ListTransactionsTool.description,
        inputSchema: ListTransactionsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(ListTransactionsTool.execute, api));
    },
  },
  {
    title: "Search Transactions",
    name: SearchTransactionsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(SearchTransactionsTool.name, {
        title: "Search Transactions",
        description: SearchTransactionsTool.description,
        inputSchema: SearchTransactionsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(SearchTransactionsTool.execute, api));
    },
  },
  {
    title: "Get Transactions By Month",
    name: GetTransactionsByMonthTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetTransactionsByMonthTool.name, {
        title: "Get Transactions By Month",
        description: GetTransactionsByMonthTool.description,
        inputSchema: GetTransactionsByMonthTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetTransactionsByMonthTool.execute, api));
    },
  },
  {
    title: "Get Transaction",
    name: GetTransactionTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetTransactionTool.name, {
        title: "Get Transaction",
        description: GetTransactionTool.description,
        inputSchema: GetTransactionTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetTransactionTool.execute, api));
    },
  },
  {
    title: "Get Transactions By Account",
    name: GetTransactionsByAccountTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetTransactionsByAccountTool.name, {
        title: "Get Transactions By Account",
        description: GetTransactionsByAccountTool.description,
        inputSchema: GetTransactionsByAccountTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetTransactionsByAccountTool.execute, api));
    },
  },
  {
    title: "Get Transactions By Category",
    name: GetTransactionsByCategoryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetTransactionsByCategoryTool.name, {
        title: "Get Transactions By Category",
        description: GetTransactionsByCategoryTool.description,
        inputSchema: GetTransactionsByCategoryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetTransactionsByCategoryTool.execute, api));
    },
  },
  {
    title: "Get Transactions By Payee",
    name: GetTransactionsByPayeeTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetTransactionsByPayeeTool.name, {
        title: "Get Transactions By Payee",
        description: GetTransactionsByPayeeTool.description,
        inputSchema: GetTransactionsByPayeeTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetTransactionsByPayeeTool.execute, api));
    },
  },
  {
    title: "List Scheduled Transactions",
    name: ListScheduledTransactionsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(ListScheduledTransactionsTool.name, {
        title: "List Scheduled Transactions",
        description: ListScheduledTransactionsTool.description,
        inputSchema: ListScheduledTransactionsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(ListScheduledTransactionsTool.execute, api));
    },
  },
  {
    title: "Get Scheduled Transaction",
    name: GetScheduledTransactionTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetScheduledTransactionTool.name, {
        title: "Get Scheduled Transaction",
        description: GetScheduledTransactionTool.description,
        inputSchema: GetScheduledTransactionTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetScheduledTransactionTool.execute, api));
    },
  },
  {
    title: "List Accounts",
    name: ListAccountsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(ListAccountsTool.name, {
        title: "List Accounts",
        description: ListAccountsTool.description,
        inputSchema: ListAccountsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(ListAccountsTool.execute, api));
    },
  },
  {
    title: "Get Account",
    name: GetAccountTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetAccountTool.name, {
        title: "Get Account",
        description: GetAccountTool.description,
        inputSchema: GetAccountTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetAccountTool.execute, api));
    },
  },
  {
    title: "List Payees",
    name: ListPayeesTool.name,
    register: (registrar, api) => {
      registrar.registerTool(ListPayeesTool.name, {
        title: "List Payees",
        description: ListPayeesTool.description,
        inputSchema: ListPayeesTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(ListPayeesTool.execute, api));
    },
  },
  {
    title: "Get Payee",
    name: GetPayeeTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetPayeeTool.name, {
        title: "Get Payee",
        description: GetPayeeTool.description,
        inputSchema: GetPayeeTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetPayeeTool.execute, api));
    },
  },
  {
    title: "List Payee Locations",
    name: ListPayeeLocationsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(ListPayeeLocationsTool.name, {
        title: "List Payee Locations",
        description: ListPayeeLocationsTool.description,
        inputSchema: ListPayeeLocationsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(ListPayeeLocationsTool.execute, api));
    },
  },
  {
    title: "Get Payee Location",
    name: GetPayeeLocationTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetPayeeLocationTool.name, {
        title: "Get Payee Location",
        description: GetPayeeLocationTool.description,
        inputSchema: GetPayeeLocationTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetPayeeLocationTool.execute, api));
    },
  },
  {
    title: "Get Payee Locations By Payee",
    name: GetPayeeLocationsByPayeeTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetPayeeLocationsByPayeeTool.name, {
        title: "Get Payee Locations By Payee",
        description: GetPayeeLocationsByPayeeTool.description,
        inputSchema: GetPayeeLocationsByPayeeTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetPayeeLocationsByPayeeTool.execute, api));
    },
  },
  {
    title: "Get Money Movements",
    name: GetMoneyMovementsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetMoneyMovementsTool.name, {
        title: "Get Money Movements",
        description: GetMoneyMovementsTool.description,
        inputSchema: GetMoneyMovementsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetMoneyMovementsTool.execute, api));
    },
  },
  {
    title: "Get Money Movements By Month",
    name: GetMoneyMovementsByMonthTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetMoneyMovementsByMonthTool.name, {
        title: "Get Money Movements By Month",
        description: GetMoneyMovementsByMonthTool.description,
        inputSchema: GetMoneyMovementsByMonthTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetMoneyMovementsByMonthTool.execute, api));
    },
  },
  {
    title: "Get Money Movement Groups",
    name: GetMoneyMovementGroupsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetMoneyMovementGroupsTool.name, {
        title: "Get Money Movement Groups",
        description: GetMoneyMovementGroupsTool.description,
        inputSchema: GetMoneyMovementGroupsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetMoneyMovementGroupsTool.execute, api));
    },
  },
  {
    title: "Get Money Movement Groups By Month",
    name: GetMoneyMovementGroupsByMonthTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetMoneyMovementGroupsByMonthTool.name, {
        title: "Get Money Movement Groups By Month",
        description: GetMoneyMovementGroupsByMonthTool.description,
        inputSchema: GetMoneyMovementGroupsByMonthTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetMoneyMovementGroupsByMonthTool.execute, api));
    },
  },
  {
    title: "Get Financial Snapshot",
    name: GetFinancialSnapshotTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetFinancialSnapshotTool.name, {
        title: "Get Financial Snapshot",
        description: GetFinancialSnapshotTool.description,
        inputSchema: GetFinancialSnapshotTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetFinancialSnapshotTool.execute, api));
    },
  },
  {
    title: "Get Financial Health Check",
    name: GetFinancialHealthCheckTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetFinancialHealthCheckTool.name, {
        title: "Get Financial Health Check",
        description: GetFinancialHealthCheckTool.description,
        inputSchema: GetFinancialHealthCheckTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetFinancialHealthCheckTool.execute, api));
    },
  },
  {
    title: "Get Spending Summary",
    name: GetSpendingSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetSpendingSummaryTool.name, {
        title: "Get Spending Summary",
        description: GetSpendingSummaryTool.description,
        inputSchema: GetSpendingSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetSpendingSummaryTool.execute, api));
    },
  },
  {
    title: "Get Spending Anomalies",
    name: GetSpendingAnomaliesTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetSpendingAnomaliesTool.name, {
        title: "Get Spending Anomalies",
        description: GetSpendingAnomaliesTool.description,
        inputSchema: GetSpendingAnomaliesTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetSpendingAnomaliesTool.execute, api));
    },
  },
  {
    title: "Get Cash Flow Summary",
    name: GetCashFlowSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetCashFlowSummaryTool.name, {
        title: "Get Cash Flow Summary",
        description: GetCashFlowSummaryTool.description,
        inputSchema: GetCashFlowSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetCashFlowSummaryTool.execute, api));
    },
  },
  {
    title: "Get Cash Runway",
    name: GetCashRunwayTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetCashRunwayTool.name, {
        title: "Get Cash Runway",
        description: GetCashRunwayTool.description,
        inputSchema: GetCashRunwayTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetCashRunwayTool.execute, api));
    },
  },
  {
    title: "Get Budget Health Summary",
    name: GetBudgetHealthSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetBudgetHealthSummaryTool.name, {
        title: "Get Budget Health Summary",
        description: GetBudgetHealthSummaryTool.description,
        inputSchema: GetBudgetHealthSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetBudgetHealthSummaryTool.execute, api));
    },
  },
  {
    title: "Get Upcoming Obligations",
    name: GetUpcomingObligationsTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetUpcomingObligationsTool.name, {
        title: "Get Upcoming Obligations",
        description: GetUpcomingObligationsTool.description,
        inputSchema: GetUpcomingObligationsTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetUpcomingObligationsTool.execute, api));
    },
  },
  {
    title: "Get Goal Progress Summary",
    name: GetGoalProgressSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetGoalProgressSummaryTool.name, {
        title: "Get Goal Progress Summary",
        description: GetGoalProgressSummaryTool.description,
        inputSchema: GetGoalProgressSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetGoalProgressSummaryTool.execute, api));
    },
  },
  {
    title: "Get Budget Cleanup Summary",
    name: GetBudgetCleanupSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetBudgetCleanupSummaryTool.name, {
        title: "Get Budget Cleanup Summary",
        description: GetBudgetCleanupSummaryTool.description,
        inputSchema: GetBudgetCleanupSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetBudgetCleanupSummaryTool.execute, api));
    },
  },
  {
    title: "Get Income Summary",
    name: GetIncomeSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetIncomeSummaryTool.name, {
        title: "Get Income Summary",
        description: GetIncomeSummaryTool.description,
        inputSchema: GetIncomeSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetIncomeSummaryTool.execute, api));
    },
  },
  {
    title: "Get Emergency Fund Coverage",
    name: GetEmergencyFundCoverageTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetEmergencyFundCoverageTool.name, {
        title: "Get Emergency Fund Coverage",
        description: GetEmergencyFundCoverageTool.description,
        inputSchema: GetEmergencyFundCoverageTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetEmergencyFundCoverageTool.execute, api));
    },
  },
  {
    title: "Get Debt Summary",
    name: GetDebtSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetDebtSummaryTool.name, {
        title: "Get Debt Summary",
        description: GetDebtSummaryTool.description,
        inputSchema: GetDebtSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetDebtSummaryTool.execute, api));
    },
  },
  {
    title: "Get Recurring Expense Summary",
    name: GetRecurringExpenseSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetRecurringExpenseSummaryTool.name, {
        title: "Get Recurring Expense Summary",
        description: GetRecurringExpenseSummaryTool.description,
        inputSchema: GetRecurringExpenseSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetRecurringExpenseSummaryTool.execute, api));
    },
  },
  {
    title: "Get Category Trend Summary",
    name: GetCategoryTrendSummaryTool.name,
    register: (registrar, api) => {
      registrar.registerTool(GetCategoryTrendSummaryTool.name, {
        title: "Get Category Trend Summary",
        description: GetCategoryTrendSummaryTool.description,
        inputSchema: GetCategoryTrendSummaryTool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(GetCategoryTrendSummaryTool.execute, api));
    },
  },
];

export function registerServerTools(registrar: ToolRegistrar, api: ynab.API): string[] {
  const registeredToolNames: string[] = [];

  for (const tool of toolRegistrations) {
    tool.register(registrar, api);
    registeredToolNames.push(tool.name);
  }

  return registeredToolNames;
}

export function createServer(config: YnabConfig, api = createYnabApi(config)): McpServer {
  const normalizedConfig = assertYnabConfig(config);
  const server = new McpServer(SERVER_INFO);
  const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);
  const registrar: ToolRegistrar = {
    registerTool: (name, toolConfig, cb) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- This adapter intentionally erases MCP's heavy generic types.
      return server.registerTool(name, toolConfig as never, cb as never);
    },
  };

  registerServerTools(registrar, configuredApi);

  return server;
}
