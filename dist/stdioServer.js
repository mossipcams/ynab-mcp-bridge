import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertYnabConfig } from "./config.js";
import { createServer } from "./server.js";
import { logStdioServerStarted } from "./startupLogging.js";
export async function startStdioServer(config) {
    const server = createServer(assertYnabConfig(config));
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logStdioServerStarted();
}
