#!/usr/bin/env node
import { startHttpServer } from "./httpTransport.js";
import { resolveAppConfig } from "./config.js";
import { startStdioServer } from "./stdioServer.js";
import { logHttpServerStarted, logStartupFailure } from "./startupLogging.js";
// Start the server
async function main() {
    const config = resolveAppConfig(process.argv.slice(2), process.env);
    if (config.runtime.transport === "http") {
        const server = await startHttpServer({
            ...config.runtime,
            ynab: config.ynab,
        });
        logHttpServerStarted(server.url);
        return;
    }
    await startStdioServer(config.ynab);
}
export function handleStartupFailure(error) {
    logStartupFailure(error);
    process.exitCode = 1;
}
main().catch((error) => {
    handleStartupFailure(error);
});
