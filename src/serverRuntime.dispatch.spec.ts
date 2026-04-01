import { describe, expect, it } from "vitest";

import { createDirectToolCallExecutor } from "./serverRuntime.js";

describe("direct tool dispatch", () => {
  it("executes registered tools directly", async () => {
    const executor = createDirectToolCallExecutor({
      apiToken: "test-token",
    });

    const result = await executor.executeToolCall("ynab_get_mcp_version", {});

    expect(result).toMatchObject({
      content: [
        {
          type: "text",
        },
      ],
    });
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      name: "ynab-mcp-bridge",
      version: expect.any(String),
    });
  });

  it("returns the same tool error shape for unknown tools", async () => {
    const executor = createDirectToolCallExecutor({
      apiToken: "test-token",
    });

    const result = await executor.executeToolCall("ynab_missing_tool", {});

    expect(result).toEqual({
      content: [
        {
          text: "Tool ynab_missing_tool not found",
          type: "text",
        },
      ],
      isError: true,
    });
  });

  it("returns validation errors before dispatching the tool", async () => {
    const executor = createDirectToolCallExecutor({
      apiToken: "test-token",
    });

    const result = await executor.executeToolCall("ynab_get_month_category", {});

    expect(result).toMatchObject({
      content: [
        {
          text: expect.stringContaining("Input validation error"),
          type: "text",
        },
      ],
      isError: true,
    });
  });
});
