import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";

export async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("YNAB MCP server running on stdio");
}
