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
import * as GetBudgetHealthSummaryTool from "./features/financialHealth/GetBudgetHealthSummaryTool.js";
import * as GetFinancialSnapshotTool from "./features/financialHealth/GetFinancialSnapshotTool.js";
import * as GetUpcomingObligationsTool from "./features/financialHealth/GetUpcomingObligationsTool.js";
import { accountsToolCatalog, financialHealthToolCatalog, metaToolCatalog, moneyMovementsToolCatalog, payeesToolCatalog, plansToolCatalog, transactionsToolCatalog, } from "./features/index.js";
import { logAppEvent } from "./logger.js";
import { getPackageInfo } from "./packageInfo.js";
import { getRequestLogFields, markToolCallStarted } from "./requestContext.js";
import { attachYnabApiRuntimeContext, createYnabApi } from "./ynabApi.js";
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
function getCurrentFinancialSnapshotResourceUri() {
    return "ynab-summary://financial-snapshot/current";
}
function getCurrentBudgetHealthResourceUri() {
    return "ynab-summary://budget-health/current";
}
function getCurrentUpcomingObligationsResourceUri() {
    return "ynab-summary://upcoming-obligations/current";
}
function getDiscoveryResourceBaseUrl(baseUrl) {
    if (!baseUrl) {
        return undefined;
    }
    return baseUrl.endsWith("/")
        ? baseUrl
        : `${baseUrl}/`;
}
function getToolCompatibilityDiscoveryUri(toolName, options = {}) {
    const discoveryResourceBaseUrl = getDiscoveryResourceBaseUrl(options.discoveryResourceBaseUrl);
    if (!discoveryResourceBaseUrl) {
        return undefined;
    }
    return new URL(encodeURIComponent(toolName), discoveryResourceBaseUrl).toString();
}
function getToolDiscoveryDocumentUris(toolName, options = {}) {
    const uris = [getToolDiscoveryUri(toolName)];
    const compatibilityUri = getToolCompatibilityDiscoveryUri(toolName, options);
    if (compatibilityUri) {
        uris.push(compatibilityUri);
    }
    return uris;
}
function getToolDiscoverySummaryUris(toolName, options = {}) {
    const canonicalUri = getToolDiscoveryUri(toolName);
    const compatibilityUri = getToolCompatibilityDiscoveryUri(toolName, options);
    const uriMode = options.discoveryResourceUriMode ?? "both";
    if (!compatibilityUri) {
        return [canonicalUri];
    }
    switch (uriMode) {
        case "canonical-only":
            return [canonicalUri];
        case "compatibility-only":
            return [compatibilityUri];
        case "both":
            return [canonicalUri, compatibilityUri];
    }
}
function buildDiscoveryResourceDocument(tool, uri) {
    const invocationGuidance = discoveryInvocationGuidanceByToolName[tool.name];
    return {
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
        description: tool.description,
        inputSchema: getToolInputJsonSchema(tool.inputSchema),
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
    ...metaToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
    ...plansToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
    ...transactionsToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
    ...accountsToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
    ...payeesToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
    ...moneyMovementsToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
    ...financialHealthToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
];
const discoveryCatalogByBaseUrl = new Map();
function getDiscoveryCatalog(options = {}) {
    const normalizedBaseUrl = getDiscoveryResourceBaseUrl(options.discoveryResourceBaseUrl);
    const cacheKey = `${normalizedBaseUrl ?? ""}|${options.discoveryResourceUriMode ?? "both"}`;
    const cachedCatalog = discoveryCatalogByBaseUrl.get(cacheKey);
    if (cachedCatalog) {
        return cachedCatalog;
    }
    const summaries = [];
    const documentsByUri = new Map();
    const toolNameByUri = new Map();
    for (const tool of toolRegistrations) {
        for (const uri of getToolDiscoveryDocumentUris(tool.name, options)) {
            documentsByUri.set(uri, buildDiscoveryResourceDocument(tool, uri));
            toolNameByUri.set(uri, tool.name);
        }
        for (const uri of getToolDiscoverySummaryUris(tool.name, options)) {
            summaries.push({
                description: tool.description,
                name: tool.name,
                title: tool.title,
                uri,
            });
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
function getDataResourceSummaries() {
    return [
        {
            description: "Compact current financial snapshot resource for summary-first reads.",
            name: "ynab_current_financial_snapshot",
            read: async (api) => {
                return await GetFinancialSnapshotTool.execute({ month: "current" }, api);
            },
            title: "Current Financial Snapshot",
            uri: getCurrentFinancialSnapshotResourceUri(),
        },
        {
            description: "Compact current budget health resource for summary-first reads.",
            name: "ynab_current_budget_health",
            read: async (api) => {
                return await GetBudgetHealthSummaryTool.execute({ month: "current", format: "compact" }, api);
            },
            title: "Current Budget Health",
            uri: getCurrentBudgetHealthResourceUri(),
        },
        {
            description: "Compact current upcoming obligations resource for summary-first reads.",
            name: "ynab_current_upcoming_obligations",
            read: async (api) => {
                return await GetUpcomingObligationsTool.execute({ format: "compact" }, api);
            },
            title: "Current Upcoming Obligations",
            uri: getCurrentUpcomingObligationsResourceUri(),
        },
    ];
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
export function getToolCatalogMetrics() {
    const toolsListResult = getToolsListResult();
    const serializedToolsList = JSON.stringify(toolsListResult);
    return {
        tool_count: toolsListResult.tools.length,
        tools_list_bytes: Buffer.byteLength(serializedToolsList, "utf8"),
        tools_list_chars: serializedToolsList.length,
    };
}
export function getRemoteBootstrapMetrics(discoveryResourceBaseUrl) {
    const toolCatalogMetrics = getToolCatalogMetrics();
    const legacyResourcesList = getResourcesListResult({ discoveryResourceBaseUrl });
    const remoteResourcesList = getResourcesListResult({
        discoveryResourceBaseUrl,
        discoveryResourceUriMode: "compatibility-only",
    });
    const legacyResourcesListBytes = Buffer.byteLength(JSON.stringify(legacyResourcesList), "utf8");
    const remoteResourcesListBytes = Buffer.byteLength(JSON.stringify(remoteResourcesList), "utf8");
    return {
        tool_count: toolCatalogMetrics.tool_count,
        tools_list_bytes: toolCatalogMetrics.tools_list_bytes,
        legacy_resources_count: legacyResourcesList.resources.length,
        legacy_resources_list_bytes: legacyResourcesListBytes,
        legacy_bootstrap_bytes: toolCatalogMetrics.tools_list_bytes + legacyResourcesListBytes,
        remote_resources_count: remoteResourcesList.resources.length,
        remote_resources_list_bytes: remoteResourcesListBytes,
        remote_bootstrap_bytes: toolCatalogMetrics.tools_list_bytes,
    };
}
export function getResourcesListResult(options = {}) {
    return {
        resources: [
            ...getDiscoveryResourceSummaries(options),
            ...getDataResourceSummaries(),
        ].map((resource) => ({
            uri: resource.uri,
            name: resource.name,
            title: resource.title,
            description: resource.description,
            mimeType: "application/json",
        })),
    };
}
async function executeToolModule(tool, input, api) {
    markToolCallStarted();
    logAppEvent("mcp", "tool.call.started", {
        ...getRequestLogFields(),
        toolName: tool.name,
    });
    try {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP validates tool input before invocation and the shared dispatcher reuses the same module contract.
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
        return await executeToolModule(tool, input, api);
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
function registerServerResources(server, api, options = {}) {
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
    for (const { description, name, read, title, uri } of getDataResourceSummaries()) {
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
                const result = await read(api);
                const textContent = result.content.find((content) => content.type === "text");
                const text = textContent?.text ?? "{}";
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
                            text,
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
    registerServerResources(server, configuredApi, options);
    return server;
}
