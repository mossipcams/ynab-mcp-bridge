import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { assertYnabConfig, type YnabConfig } from "./config.js";
import { createServer } from "./serverRuntime.js";
import { logStdioServerStarted } from "./startupLogging.js";

export async function startStdioServer(config: YnabConfig) {
  const server = createServer(assertYnabConfig(config));
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logStdioServerStarted();
}
