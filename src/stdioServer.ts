import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readYnabConfig, type YnabConfig } from "./config.js";
import { createServer } from "./server.js";

export async function startStdioServer(config: YnabConfig = readYnabConfig(process.env)) {
  const server = createServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("YNAB MCP server running on stdio");
}
