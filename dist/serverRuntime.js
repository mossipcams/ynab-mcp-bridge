/**
 * Owns: top-level MCP server creation, tool metadata definitions, ordered tool registration, and the logging-wrapped registrar loop.
 * Inputs/dependencies: validated YNAB config, YNAB API factory/runtime attachment, tool modules, request-context logging helpers, MCP registrar.
 * Outputs/contracts: defineTool(...), registerServerTools(...), and createServer(...).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalizeObjectSchema, } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { assertYnabConfig } from "./config.js";
import { logAppEvent } from "./logger.js";
import { getPackageInfo } from "./packageInfo.js";
import { getRequestLogFields, markToolCallStarted } from "./requestContext.js";
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
import * as GetMonthlyReviewTool from "./tools/GetMonthlyReviewTool.js";
import * as GetNetWorthTrajectoryTool from "./tools/GetNetWorthTrajectoryTool.js";
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
};
const READ_ONLY_TOOL_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};
const discoveryInvocationGuidanceByToolName = {
    ynab_get_month_category: {
        requiredArguments: ["month", "categoryId"],
        argumentExamples: {
            month: "2026-03-01",
            categoryId: "category-123",
        },
        invocationExample: {
            month: "2026-03-01",
            categoryId: "category-123",
            view: "compact",
        },
    },
    ynab_get_net_worth_trajectory: {
        requiredArguments: ["fromMonth"],
        argumentExamples: {
            fromMonth: "2026-01-01",
            toMonth: "2026-03-01",
        },
        invocationExample: {
            fromMonth: "2026-01-01",
            toMonth: "2026-03-01",
        },
    },
    ynab_get_spending_anomalies: {
        requiredArguments: ["latestMonth"],
        argumentExamples: {
            latestMonth: "2026-03-01",
            baselineMonths: 3,
            topN: 5,
        },
        invocationExample: {
            latestMonth: "2026-03-01",
            baselineMonths: 3,
            thresholdMultiplier: 1.5,
            minimumDifference: 50000,
            topN: 5,
        },
    },
    ynab_get_payee_location: {
        requiredArguments: ["payeeLocationId"],
        argumentExamples: {
            payeeLocationId: "payee-location-123",
        },
        invocationExample: {
            payeeLocationId: "payee-location-123",
        },
    },
};
function getToolDiscoveryUri(toolName) {
    return `ynab-tool://${toolName}`;
}
function getDiscoveryResourceBaseUrl(baseUrl) {
    if (!baseUrl) {
        return undefined;
    }
    return baseUrl.endsWith("/")
        ? baseUrl
        : `${baseUrl}/`;
}
function getToolDiscoveryUris(toolName, options = {}) {
    const uris = [getToolDiscoveryUri(toolName)];
    const discoveryResourceBaseUrl = getDiscoveryResourceBaseUrl(options.discoveryResourceBaseUrl);
    if (discoveryResourceBaseUrl) {
        uris.push(new URL(encodeURIComponent(toolName), discoveryResourceBaseUrl).toString());
    }
    return uris;
}
function buildDiscoveryResourceDocument(tool, uri) {
    const invocationGuidance = discoveryInvocationGuidanceByToolName[tool.name];
    return {
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
        description: tool.description,
        inputSchema: tool.inputSchema,
        title: tool.title,
        toolName: tool.name,
        uri,
        ...(invocationGuidance ? {
            argumentExamples: invocationGuidance.argumentExamples,
            invocationExample: invocationGuidance.invocationExample,
            requiredArguments: invocationGuidance.requiredArguments,
        } : {}),
    };
}
export function defineTool(title, tool) {
    return {
        title,
        ...tool,
    };
}
const toolRegistrations = [
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
    defineTool("Get Monthly Review", GetMonthlyReviewTool),
    defineTool("Get Net Worth Trajectory", GetNetWorthTrajectoryTool),
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
];
const discoveryCatalogByBaseUrl = new Map();
function getDiscoveryCatalog(options = {}) {
    const normalizedBaseUrl = getDiscoveryResourceBaseUrl(options.discoveryResourceBaseUrl);
    const cacheKey = normalizedBaseUrl ?? "";
    const cachedCatalog = discoveryCatalogByBaseUrl.get(cacheKey);
    if (cachedCatalog) {
        return cachedCatalog;
    }
    const summaries = [];
    const documentsByUri = new Map();
    const toolNameByUri = new Map();
    for (const tool of toolRegistrations) {
        for (const uri of getToolDiscoveryUris(tool.name, options)) {
            summaries.push({
                description: tool.description,
                name: tool.name,
                title: tool.title,
                uri,
            });
            documentsByUri.set(uri, buildDiscoveryResourceDocument(tool, uri));
            toolNameByUri.set(uri, tool.name);
        }
    }
    const catalog = {
        documentsByUri,
        summaries,
        toolNameByUri,
    };
    discoveryCatalogByBaseUrl.set(cacheKey, catalog);
    return catalog;
}
export function getDiscoveryResourceSummaries(options = {}) {
    return getDiscoveryCatalog(options).summaries;
}
function getToolInputJsonSchema(inputSchema) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP tool definitions provide raw Zod shapes or schemas consumed by the SDK helper.
    const schema = inputSchema;
    const objectSchema = normalizeObjectSchema(schema);
    if (!objectSchema) {
        return {
            properties: {},
            type: "object",
        };
    }
    const jsonSchema = toJsonSchemaCompat(objectSchema, {
        pipeStrategy: "input",
        strictUnions: true,
    });
    return jsonSchema;
}
export function getInitializeResult() {
    return {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {
            tools: {
                listChanged: true,
            },
            resources: {
                listChanged: true,
            },
        },
        serverInfo: SERVER_INFO,
    };
}
export function getToolsListResult() {
    return {
        tools: toolRegistrations.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: getToolInputJsonSchema(tool.inputSchema),
            annotations: READ_ONLY_TOOL_ANNOTATIONS,
            execution: {
                taskSupport: "forbidden",
            },
        })),
    };
}
export function getResourcesListResult(options = {}) {
    return {
        resources: getDiscoveryResourceSummaries(options).map((resource) => ({
            uri: resource.uri,
            name: resource.name,
            title: resource.title,
            description: resource.description,
            mimeType: "application/json",
        })),
    };
}
export async function createFastPathToolCallResults() {
    const fastPathResults = new Map();
    fastPathResults.set(GetMcpVersionTool.name, {
        content: [
            {
                text: JSON.stringify(SERVER_INFO),
                type: "text",
            },
        ],
    });
    return fastPathResults;
}
export function getDiscoveryResourceDocument(toolName, uri, options = {}) {
    const catalog = getDiscoveryCatalog(options);
    const resolvedToolName = catalog.toolNameByUri.get(uri);
    if (resolvedToolName !== toolName) {
        throw new Error(`Discovery resource URI does not match tool ${toolName}: ${uri}`);
    }
    const document = catalog.documentsByUri.get(uri);
    if (!document) {
        throw new Error(`Discovery resource URI does not match tool ${toolName}: ${uri}`);
    }
    return document;
}
function registerTool(registrar, tool, api) {
    registrar.registerTool(tool.name, {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
    }, async (input) => {
        markToolCallStarted();
        logAppEvent("mcp", "tool.call.started", {
            ...getRequestLogFields(),
            toolName: tool.name,
        });
        try {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP validates tool input before invocation.
            const result = await tool.execute(input, api);
            const failed = "isError" in result && result.isError === true;
            logAppEvent("mcp", failed ? "tool.call.failed" : "tool.call.succeeded", {
                ...getRequestLogFields(),
                toolName: tool.name,
            });
            return result;
        }
        catch (error) {
            logAppEvent("mcp", "tool.call.failed", {
                ...getRequestLogFields(),
                error,
                toolName: tool.name,
            });
            throw error;
        }
    });
}
export function registerServerTools(registrar, api) {
    const registeredToolNames = [];
    for (const tool of toolRegistrations) {
        registerTool(registrar, tool, api);
        registeredToolNames.push(tool.name);
    }
    return registeredToolNames;
}
function registerServerResources(server, options = {}) {
    const registeredResourceUris = [];
    for (const { description, name, title, uri } of getDiscoveryResourceSummaries(options)) {
        server.registerResource(name, uri, {
            title,
            description,
            mimeType: "application/json",
        }, async () => {
            logAppEvent("mcp", "resource.read.started", {
                ...getRequestLogFields(),
                resourceName: name,
                resourceUri: uri,
            });
            try {
                const document = getDiscoveryResourceDocument(name, uri, options);
                logAppEvent("mcp", "resource.read.succeeded", {
                    ...getRequestLogFields(),
                    resourceName: name,
                    resourceUri: uri,
                });
                return {
                    contents: [
                        {
                            uri,
                            mimeType: "application/json",
                            text: JSON.stringify(document),
                        },
                    ],
                };
            }
            catch (error) {
                logAppEvent("mcp", "resource.read.failed", {
                    ...getRequestLogFields(),
                    error,
                    resourceName: name,
                    resourceUri: uri,
                });
                throw error;
            }
        });
        registeredResourceUris.push(uri);
    }
    return registeredResourceUris;
}
export function createServer(config, api = createYnabApi(config), options = {}) {
    const normalizedConfig = assertYnabConfig(config);
    const server = new McpServer(SERVER_INFO);
    const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- McpServer structurally satisfies the runtime registrar contract.
    registerServerTools(server, configuredApi);
    registerServerResources(server, options);
    return server;
}
