import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertYnabConfig } from "./config.js";
import { createServer } from "./server.js";
export async function startStdioServer(config) {
    const server = createServer(assertYnabConfig(config));
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("YNAB MCP server running on stdio");
}
