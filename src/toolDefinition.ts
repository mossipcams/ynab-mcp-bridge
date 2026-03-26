import * as ynab from "ynab";

import { logAppEvent } from "./logger.js";
import { getRequestLogFields, markToolCallStarted } from "./requestContext.js";

export const READ_ONLY_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export type ToolRegistrar = {
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

type ToolDefinitionModule<TResult> = {
  description: string;
  execute: (input: never, api: ynab.API) => TResult;
  inputSchema: unknown;
  name: string;
};

export type ToolDefinition = {
  name: string;
  register: (registrar: ToolRegistrar, api: ynab.API) => void;
  title: string;
};

function stripUndefinedProperties(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function executeTool<TResult>(
  execute: (input: never, api: ynab.API) => TResult,
  api: ynab.API,
  toolName: string,
): (input: Record<string, unknown>) => Promise<Awaited<TResult>> {
  return async (input: Record<string, unknown>): Promise<Awaited<TResult>> => {
    const sanitizedInput = stripUndefinedProperties(input);

    markToolCallStarted();
    logAppEvent("mcp", "tool.call.started", {
      ...getRequestLogFields(),
      toolName,
    });

    try {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP validates tool input before invocation.
      const result = await execute(sanitizedInput as never, api);
      const failed = typeof result === "object" && result !== null && "isError" in result && result.isError === true;

      logAppEvent("mcp", failed ? "tool.call.failed" : "tool.call.succeeded", {
        ...getRequestLogFields(),
        toolName,
      });

      return result;
    } catch (error) {
      logAppEvent("mcp", "tool.call.failed", {
        ...getRequestLogFields(),
        error,
        toolName,
      });
      throw error;
    }
  };
}

export function defineReadOnlyTool<TResult>(
  title: string,
  tool: ToolDefinitionModule<TResult>,
): ToolDefinition {
  return {
    name: tool.name,
    title,
    register: (registrar, api) => {
      registrar.registerTool(tool.name, {
        title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      }, executeTool(tool.execute, api, tool.name));
    },
  };
}

export function registerDefinedTools(
  registrar: ToolRegistrar,
  api: ynab.API,
  definitions: readonly ToolDefinition[],
): string[] {
  const registeredToolNames: string[] = [];

  for (const definition of definitions) {
    definition.register(registrar, api);
    registeredToolNames.push(definition.name);
  }

  return registeredToolNames;
}
