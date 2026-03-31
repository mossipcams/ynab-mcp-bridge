#!/usr/bin/env node
import { startHttpServer } from "./httpTransport.js";
import { resolveAppConfig } from "./config.js";
import { createAuthStartupLogDetails } from "./auth2/config/schema.js";
import { startStdioServer } from "./stdioServer.js";
import {
  logAuthConfigLoaded,
  logHttpServerStarted,
  logStartupFailure,
} from "./startupLogging.js";

// Start the server
async function main() {
  const args = process.argv.slice(2);
  const config = resolveAppConfig(args, process.env);

  if (config.auth2Config) {
    logAuthConfigLoaded(createAuthStartupLogDetails(config.auth2Config));
  }

  if (config.runtime.transport === "http") {
    const server = await startHttpServer({
      ...config.runtime,
      ...(config.auth2Config ? { auth2Config: config.auth2Config } : {}),
      ynab: config.ynab,
    });
    logHttpServerStarted(server.url);
    return;
  }

  await startStdioServer(config.ynab);
}

export function handleStartupFailure(error: unknown) {
  logStartupFailure(error);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  handleStartupFailure(error);
});
