import { describe, expect, it } from "vitest";

import { toErrorResult, toTextResult } from "./tools/planToolUtils.js";

describe("plan tool response helpers", () => {
  it("serializes payloads as compact JSON by default", () => {
    const result = toTextResult({
      status: "ok",
      metrics: {
        net_worth: "123.45",
      },
    });

    expect(result).toEqual({
      content: [{
        type: "text",
        text: "{\"status\":\"ok\",\"metrics\":{\"net_worth\":\"123.45\"}}",
      }],
    });
  });

  it("can still serialize payloads as pretty JSON when requested", () => {
    const result = toTextResult(
      {
        status: "ok",
        metrics: {
          net_worth: "123.45",
        },
      },
      "pretty",
    );

    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "{",
          "  \"status\": \"ok\",",
          "  \"metrics\": {",
          "    \"net_worth\": \"123.45\"",
          "  }",
          "}",
        ].join("\n"),
      }],
    });
  });

  it("keeps error payloads compact by default", () => {
    const result = toErrorResult(new Error("Bad request"));

    expect(result).toEqual({
      isError: true,
      content: [{
        type: "text",
        text: "{\"success\":false,\"error\":\"Bad request\"}",
      }],
    });
  });
});
