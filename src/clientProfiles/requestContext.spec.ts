import { describe, expect, it } from "vitest";

import { getRequestOrigin, getRequestUserAgent } from "./requestContext.js";

describe("client profile request context helpers", () => {
  it("normalizes blank origin and user-agent headers to undefined", () => {
    expect(getRequestOrigin({
      headers: {
        origin: "   ",
      },
      method: "GET",
      path: "/mcp",
    })).toBeUndefined();

    expect(getRequestUserAgent({
      headers: {
        "user-agent": ["   "],
      },
      method: "GET",
      path: "/mcp",
    })).toBeUndefined();
  });

  it("normalizes comma-delimited header values before lowercasing", () => {
    expect(getRequestOrigin({
      headers: {
        origin: " HTTPS://Claude.ai , https://example.com ",
      },
      method: "GET",
      path: "/mcp",
    })).toBe("https://claude.ai");

    expect(getRequestUserAgent({
      headers: {
        "user-agent": [" OpenAI Codex/0.1.0 , fallback "],
      },
      method: "GET",
      path: "/mcp",
    })).toBe("openai codex/0.1.0");
  });
});
