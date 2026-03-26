import { logAppEvent } from "./logger.js";
import { getRequestLogFields, markToolCallStarted } from "./requestContext.js";
export const READ_ONLY_TOOL_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};
function stripUndefinedProperties(input) {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
function executeTool(execute, api, toolName) {
    return async (input) => {
        const sanitizedInput = stripUndefinedProperties(input);
        markToolCallStarted();
        logAppEvent("mcp", "tool.call.started", {
            ...getRequestLogFields(),
            toolName,
        });
        try {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP validates tool input before invocation.
            const result = await execute(sanitizedInput, api);
            const failed = typeof result === "object" && result !== null && "isError" in result && result.isError === true;
            logAppEvent("mcp", failed ? "tool.call.failed" : "tool.call.succeeded", {
                ...getRequestLogFields(),
                toolName,
            });
            return result;
        }
        catch (error) {
            logAppEvent("mcp", "tool.call.failed", {
                ...getRequestLogFields(),
                error,
                toolName,
            });
            throw error;
        }
    };
}
export function defineReadOnlyTool(title, tool) {
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
export function registerDefinedTools(registrar, api, definitions) {
    const registeredToolNames = [];
    for (const definition of definitions) {
        definition.register(registrar, api);
        registeredToolNames.push(definition.name);
    }
    return registeredToolNames;
}
