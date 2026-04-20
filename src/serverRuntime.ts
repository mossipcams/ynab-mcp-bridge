/**
 * Owns: top-level MCP server creation, tool metadata definitions, ordered tool registration, and the logging-wrapped registrar loop.
 * Inputs/dependencies: validated YNAB config, YNAB API factory/runtime attachment, tool modules, request-context logging helpers, MCP registrar.
 * Outputs/contracts: defineTool(...), registerServerTools(...), and createServer(...).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  normalizeObjectSchema,
  type AnySchema,
  type ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { LATEST_PROTOCOL_VERSION, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { API } from "ynab";

import { assertYnabConfig, type YnabConfig } from "./config.js";
import * as GetBudgetHealthSummaryTool from "./features/financialHealth/GetBudgetHealthSummaryTool.js";
import * as GetFinancialSnapshotTool from "./features/financialHealth/GetFinancialSnapshotTool.js";
import * as GetUpcomingObligationsTool from "./features/financialHealth/GetUpcomingObligationsTool.js";
import {
  accountsToolCatalog,
  financialHealthToolCatalog,
  metaToolCatalog,
  moneyMovementsToolCatalog,
  payeesToolCatalog,
  plansToolCatalog,
  transactionsToolCatalog,
} from "./features/index.js";
import { logAppEvent } from "./logger.js";
import { getPackageInfo } from "./packageInfo.js";
import { getRequestLogFields, markToolCallStarted } from "./requestContext.js";
import { attachYnabApiRuntimeContext, createYnabApi } from "./ynabApi.js";

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
  execute: (input: never, api: API) => Promise<CallToolResult> | CallToolResult;
};

type ToolSource = Omit<ToolModule, "title">;
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

export type DiscoveryResourceUriMode =
  | "both"
  | "canonical-only"
  | "compatibility-only";

type ServerRuntimeOptions = {
  discoveryResourceBaseUrl?: string;
  discoveryResourceUriMode?: DiscoveryResourceUriMode;
};

type DiscoveryResourceSummary = {
  description: string;
  mimeType?: string;
  name: string;
  title: string;
  uri: string;
};

type DataResourceSummary = {
  description: string;
  mimeType?: string;
  name: string;
  read: (api: API) => Promise<CallToolResult> | CallToolResult;
  title: string;
  uri: string;
};

type DiscoveryResourceDocument = {
  argumentExamples?: Record<string, string | number>;
  annotations: typeof READ_ONLY_TOOL_ANNOTATIONS;
  description: string;
  inputSchema: unknown;
  invocationExample?: Record<string, string | number>;
  requiredArguments?: string[];
  title: string;
  toolName: string;
  uri: string;
};

type DiscoveryCatalog = {
  documentsByUri: Map<string, DiscoveryResourceDocument>;
  summaries: DiscoveryResourceSummary[];
  toolNameByUri: Map<string, string>;
};

type DiscoveryInvocationGuidance = {
  argumentExamples: Record<string, string | number>;
  invocationExample: Record<string, string | number>;
  requiredArguments: string[];
};

type InitializeResult = {
  capabilities: {
    resources: {
      listChanged: true;
    };
    tools: {
      listChanged: true;
    };
  };
  protocolVersion: string;
  serverInfo: typeof SERVER_INFO;
};

type ToolsListResult = {
  tools: Array<{
    annotations: typeof READ_ONLY_TOOL_ANNOTATIONS;
    description: string;
    execution: {
      taskSupport: "forbidden";
    };
    inputSchema: Record<string, unknown>;
    name: string;
    title: string;
  }>;
};

type ResourcesListResult = {
  resources: Array<{
    description: string;
    mimeType: "application/json";
    name: string;
    title: string;
    uri: string;
  }>;
};

const discoveryInvocationGuidanceByToolName: Partial<Record<string, DiscoveryInvocationGuidance>> = {
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

function getToolDiscoveryUri(toolName: string): string {
  return `ynab-tool://${toolName}`;
}

function getCurrentFinancialSnapshotResourceUri(): string {
  return "ynab-summary://financial-snapshot/current";
}

function getCurrentBudgetHealthResourceUri(): string {
  return "ynab-summary://budget-health/current";
}

function getCurrentUpcomingObligationsResourceUri(): string {
  return "ynab-summary://upcoming-obligations/current";
}

function getDiscoveryResourceBaseUrl(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  return baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
}

function getToolCompatibilityDiscoveryUri(toolName: string, options: ServerRuntimeOptions = {}): string | undefined {
  const discoveryResourceBaseUrl = getDiscoveryResourceBaseUrl(options.discoveryResourceBaseUrl);

  if (!discoveryResourceBaseUrl) {
    return undefined;
  }

  return new URL(encodeURIComponent(toolName), discoveryResourceBaseUrl).toString();
}

function getToolDiscoveryDocumentUris(toolName: string, options: ServerRuntimeOptions = {}): string[] {
  const uris = [getToolDiscoveryUri(toolName)];
  const compatibilityUri = getToolCompatibilityDiscoveryUri(toolName, options);

  if (compatibilityUri) {
    uris.push(compatibilityUri);
  }

  return uris;
}

function getToolDiscoverySummaryUris(toolName: string, options: ServerRuntimeOptions = {}): string[] {
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

function buildDiscoveryResourceDocument(
  tool: ToolModule,
  uri: string,
): DiscoveryResourceDocument {
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

export function defineTool(title: string, tool: ToolSource): ToolModule {
  return {
    title,
    ...tool,
  };
}

const toolRegistrations: ToolModule[] = [
  ...metaToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
  ...plansToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
  ...transactionsToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
  ...accountsToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
  ...payeesToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
  ...moneyMovementsToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
  ...financialHealthToolCatalog.map(({ title, tool }) => defineTool(title, tool)),
];

const discoveryCatalogByBaseUrl = new Map<string, DiscoveryCatalog>();

function getDiscoveryCatalog(options: ServerRuntimeOptions = {}): DiscoveryCatalog {
  const normalizedBaseUrl = getDiscoveryResourceBaseUrl(options.discoveryResourceBaseUrl);
  const cacheKey = `${normalizedBaseUrl ?? ""}|${options.discoveryResourceUriMode ?? "both"}`;
  const cachedCatalog = discoveryCatalogByBaseUrl.get(cacheKey);

  if (cachedCatalog) {
    return cachedCatalog;
  }

  const summaries: DiscoveryResourceSummary[] = [];
  const documentsByUri = new Map<string, DiscoveryResourceDocument>();
  const toolNameByUri = new Map<string, string>();

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
  } satisfies DiscoveryCatalog;
  discoveryCatalogByBaseUrl.set(cacheKey, catalog);
  return catalog;
}

export function getDiscoveryResourceSummaries(options: ServerRuntimeOptions = {}): DiscoveryResourceSummary[] {
  return getDiscoveryCatalog(options).summaries;
}

function getDataResourceSummaries(): DataResourceSummary[] {
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

function getToolInputJsonSchema(
  inputSchema: unknown,
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP tool definitions provide raw Zod shapes or schemas consumed by the SDK helper.
  const schema = inputSchema as AnySchema | ZodRawShapeCompat | undefined;
  const objectSchema = normalizeObjectSchema(schema);

  if (!objectSchema) {
    return {
      properties: {},
      type: "object",
    };
  }

  const jsonSchema: Record<string, unknown> = toJsonSchemaCompat(objectSchema, {
    pipeStrategy: "input",
    strictUnions: true,
  });

  return jsonSchema;
}

export function getInitializeResult(): InitializeResult {
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

export function getToolsListResult(): ToolsListResult {
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

export type ToolCatalogMetrics = {
  tool_count: number;
  tools_list_bytes: number;
  tools_list_chars: number;
};

export type RemoteBootstrapMetrics = {
  legacy_bootstrap_bytes: number;
  legacy_resources_count: number;
  legacy_resources_list_bytes: number;
  remote_bootstrap_bytes: number;
  remote_resources_count: number;
  remote_resources_list_bytes: number;
  tool_count: number;
  tools_list_bytes: number;
};

export function getToolCatalogMetrics(): ToolCatalogMetrics {
  const toolsListResult = getToolsListResult();
  const serializedToolsList = JSON.stringify(toolsListResult);

  return {
    tool_count: toolsListResult.tools.length,
    tools_list_bytes: Buffer.byteLength(serializedToolsList, "utf8"),
    tools_list_chars: serializedToolsList.length,
  };
}

export function getRemoteBootstrapMetrics(discoveryResourceBaseUrl: string): RemoteBootstrapMetrics {
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

export function getResourcesListResult(options: ServerRuntimeOptions = {}): ResourcesListResult {
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

async function executeToolModule(tool: ToolModule, input: Record<string, unknown>, api: API): Promise<CallToolResult> {
  markToolCallStarted();
  logAppEvent("mcp", "tool.call.started", {
    ...getRequestLogFields(),
    toolName: tool.name,
  });

  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP validates tool input before invocation and the shared dispatcher reuses the same module contract.
    const result = await tool.execute(input as never, api);
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
}

export function getDiscoveryResourceDocument(
  toolName: string,
  uri: string,
  options: ServerRuntimeOptions = {},
): DiscoveryResourceDocument {
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

function registerTool(registrar: ToolRegistrar, tool: ToolModule, api: API): void {
  registrar.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async (input: Record<string, unknown>) => {
      return await executeToolModule(tool, input, api);
    },
  );
}

export function registerServerTools(registrar: ToolRegistrar, api: API): string[] {
  const registeredToolNames: string[] = [];

  for (const tool of toolRegistrations) {
    registerTool(registrar, tool, api);
    registeredToolNames.push(tool.name);
  }

  return registeredToolNames;
}

function registerServerResources(server: McpServer, api: API, options: ServerRuntimeOptions = {}): string[] {
  const registeredResourceUris: string[] = [];

  for (const { description, name, title, uri } of getDiscoveryResourceSummaries(options)) {
    server.registerResource(
      name,
      uri,
      {
        title,
        description,
        mimeType: "application/json",
      },
      async () => {
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
        } catch (error) {
          logAppEvent("mcp", "resource.read.failed", {
            ...getRequestLogFields(),
            error,
            resourceName: name,
            resourceUri: uri,
          });
          throw error;
        }
      },
    );

    registeredResourceUris.push(uri);
  }

  for (const { description, name, read, title, uri } of getDataResourceSummaries()) {
    server.registerResource(
      name,
      uri,
      {
        title,
        description,
        mimeType: "application/json",
      },
      async () => {
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
        } catch (error) {
          logAppEvent("mcp", "resource.read.failed", {
            ...getRequestLogFields(),
            error,
            resourceName: name,
            resourceUri: uri,
          });
          throw error;
        }
      },
    );

    registeredResourceUris.push(uri);
  }

  return registeredResourceUris;
}

export function createServer(
  config: YnabConfig,
  api: API | object = createYnabApi(config),
  options: ServerRuntimeOptions = {},
): McpServer {
  const normalizedConfig = assertYnabConfig(config);
  const server = new McpServer(SERVER_INFO);
  const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- McpServer structurally satisfies the runtime registrar contract.
  registerServerTools(server as unknown as ToolRegistrar, configuredApi);
  registerServerResources(server, configuredApi, options);

  return server;
}
