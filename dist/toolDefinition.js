export const READ_ONLY_TOOL_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};
function stripUndefinedProperties(input) {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
function executeTool(execute, api) {
    return (input) => {
        const sanitizedInput = stripUndefinedProperties(input);
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP validates tool input before invocation.
        return execute(sanitizedInput, api);
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
            }, executeTool(tool.execute, api));
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
