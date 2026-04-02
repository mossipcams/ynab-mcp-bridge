import { describe, expect, it } from "vitest";

import {
  getDiscoveryResourceDocument,
  getDiscoveryResourceSummaries,
  getToolsListResult,
} from "./serverRuntime.js";

describe("server runtime tool metadata parity", () => {
  it("keeps canonical discovery summaries aligned with tools/list output", () => {
    const tools = getToolsListResult().tools;
    const canonicalSummaries = getDiscoveryResourceSummaries()
      .filter((resource) => resource.uri.startsWith("ynab-tool://"));

    expect(canonicalSummaries.map((resource) => resource.name).sort()).toEqual(
      tools.map((tool) => tool.name).sort(),
    );
  });

  it("builds discovery documents from the same tool metadata exposed in tools/list", () => {
    const tool = getToolsListResult().tools.find((entry) => entry.name === "ynab_get_mcp_version");

    expect(tool).toBeDefined();

    const document = getDiscoveryResourceDocument(
      "ynab_get_mcp_version",
      "ynab-tool://ynab_get_mcp_version",
    );

    expect(document).toMatchObject({
      annotations: tool?.annotations,
      description: tool?.description,
      inputSchema: tool?.inputSchema,
      title: tool?.title,
      toolName: tool?.name,
      uri: "ynab-tool://ynab_get_mcp_version",
    });
  });
});
