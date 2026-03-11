#!/usr/bin/env node
import { startHttpServer } from "./httpServer.js";
import { assertBackendEnvironment, resolveRuntimeConfig } from "./runtimeConfig.js";
import { startStdioServer } from "./stdioServer.js";
// Start the server
async function main() {
    assertBackendEnvironment(process.env);
    const config = resolveRuntimeConfig(process.argv.slice(2), process.env);
    if (config.transport === "http") {
        const server = await startHttpServer(config);
        console.error(`YNAB MCP server running on ${server.url}`);
        return;
    }
    await startStdioServer();
}
main().catch(console.error);
