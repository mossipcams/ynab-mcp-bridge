import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assertYnabConfig } from "./config.js";
import { getPackageInfo } from "./packageInfo.js";
import { attachYnabApiRuntimeContext, createYnabApi } from "./ynabApi.js";
import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetBudgetCleanupSummaryTool from "./tools/GetBudgetCleanupSummaryTool.js";
import * as GetBudgetRatioSummaryTool from "./tools/GetBudgetRatioSummaryTool.js";
import * as GetBudgetHealthSummaryTool from "./tools/GetBudgetHealthSummaryTool.js";
import * as GetCashFlowSummaryTool from "./tools/GetCashFlowSummaryTool.js";
import * as GetCategoryTool from "./tools/GetCategoryTool.js";
import * as GetCategoryTrendSummaryTool from "./tools/GetCategoryTrendSummaryTool.js";
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
import * as GetSpendingSummaryTool from "./tools/GetSpendingSummaryTool.js";
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
import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as ListPayeeLocationsTool from "./tools/ListPayeeLocationsTool.js";
import * as ListPlanMonthsTool from "./tools/ListPlanMonthsTool.js";
import * as ListPayeesTool from "./tools/ListPayeesTool.js";
import * as ListPlanCategoriesTool from "./tools/ListPlanCategoriesTool.js";
import * as ListPlansTool from "./tools/ListPlansTool.js";
import * as ListScheduledTransactionsTool from "./tools/ListScheduledTransactionsTool.js";
import * as ListTransactionsTool from "./tools/ListTransactionsTool.js";
const packageInfo = getPackageInfo();
export const SERVER_INFO = {
    name: packageInfo.name,
    version: packageInfo.version,
};
export const toolRegistrations = [
    { title: "Get MCP Version", module: GetMcpVersionTool },
    { title: "Get User", module: GetUserTool },
    { title: "List Plans", module: ListPlansTool },
    { title: "Get Plan", module: GetPlanDetailsTool },
    { title: "Get Plan Settings", module: GetPlanSettingsTool },
    { title: "Get Plan Month", module: GetPlanMonthTool },
    { title: "List Plan Months", module: ListPlanMonthsTool },
    { title: "List Categories", module: ListPlanCategoriesTool },
    { title: "Get Category", module: GetCategoryTool },
    { title: "Get Month Category", module: GetMonthCategoryTool },
    { title: "List Transactions", module: ListTransactionsTool },
    { title: "Get Transactions By Month", module: GetTransactionsByMonthTool },
    { title: "Get Transaction", module: GetTransactionTool },
    { title: "Get Transactions By Account", module: GetTransactionsByAccountTool },
    { title: "Get Transactions By Category", module: GetTransactionsByCategoryTool },
    { title: "Get Transactions By Payee", module: GetTransactionsByPayeeTool },
    { title: "List Scheduled Transactions", module: ListScheduledTransactionsTool },
    { title: "Get Scheduled Transaction", module: GetScheduledTransactionTool },
    { title: "List Accounts", module: ListAccountsTool },
    { title: "Get Account", module: GetAccountTool },
    { title: "List Payees", module: ListPayeesTool },
    { title: "Get Payee", module: GetPayeeTool },
    { title: "List Payee Locations", module: ListPayeeLocationsTool },
    { title: "Get Payee Location", module: GetPayeeLocationTool },
    { title: "Get Payee Locations By Payee", module: GetPayeeLocationsByPayeeTool },
    { title: "Get Money Movements", module: GetMoneyMovementsTool },
    { title: "Get Money Movements By Month", module: GetMoneyMovementsByMonthTool },
    { title: "Get Money Movement Groups", module: GetMoneyMovementGroupsTool },
    { title: "Get Money Movement Groups By Month", module: GetMoneyMovementGroupsByMonthTool },
    { title: "Get Financial Snapshot", module: GetFinancialSnapshotTool },
    { title: "Get Spending Summary", module: GetSpendingSummaryTool },
    { title: "Get Cash Flow Summary", module: GetCashFlowSummaryTool },
    { title: "Get Budget Health Summary", module: GetBudgetHealthSummaryTool },
    { title: "Get Upcoming Obligations", module: GetUpcomingObligationsTool },
    { title: "Get Goal Progress Summary", module: GetGoalProgressSummaryTool },
    { title: "Get Budget Cleanup Summary", module: GetBudgetCleanupSummaryTool },
    { title: "Get Income Summary", module: GetIncomeSummaryTool },
    { title: "Get Category Trend Summary", module: GetCategoryTrendSummaryTool },
    { title: "Get 70/20/10 Summary", module: GetBudgetRatioSummaryTool },
];
const PUBLIC_OAUTH_TOOL_NAMES = new Set([
    GetMcpVersionTool.name,
]);
function buildToolMetadata(toolName, options) {
    const securitySchemes = (options.authMode === "oauth" && !PUBLIC_OAUTH_TOOL_NAMES.has(toolName))
        ? [{
                scopes: options.oauthScopes && options.oauthScopes.length > 0 ? options.oauthScopes : undefined,
                type: "oauth2",
            }]
        : [{
                type: "noauth",
            }];
    return {
        _meta: {
            securitySchemes,
        },
        annotations: {
            openWorldHint: false,
            readOnlyHint: true,
        },
    };
}
export function isPublicToolName(toolName) {
    return PUBLIC_OAUTH_TOOL_NAMES.has(toolName);
}
export function registerServerTools(registrar, api, options = {
    authMode: "none",
}) {
    const registeredToolNames = [];
    for (const { title, module } of toolRegistrations) {
        const metadata = buildToolMetadata(module.name, options);
        registrar.registerTool(module.name, {
            ...metadata,
            title,
            description: module.description,
            inputSchema: module.inputSchema,
        }, async (input) => module.execute(input, api));
        registeredToolNames.push(module.name);
    }
    return registeredToolNames;
}
export function createServer(config, api = createYnabApi(config), options = {}) {
    const normalizedConfig = assertYnabConfig(config);
    const server = new McpServer(SERVER_INFO);
    const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);
    registerServerTools(server, configuredApi, {
        authMode: options.auth?.mode ?? "none",
        oauthScopes: options.auth?.mode === "oauth" ? options.auth.scopes : undefined,
    });
    return server;
}
