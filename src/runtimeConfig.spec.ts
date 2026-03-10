import { describe, expect, it } from "vitest";
import { resolveRuntimeConfig } from "./runtimeConfig.js";

describe("resolveRuntimeConfig", () => {
  it("prefers explicit CLI flags for http mode", () => {
    const config = resolveRuntimeConfig(
      ["--transport", "http", "--host", "127.0.0.1", "--port", "8080", "--path", "/bridge"],
      {},
    );

    expect(config).toEqual({
      host: "127.0.0.1",
      path: "/bridge",
      port: 8080,
      transport: "http",
    });
  });

  it("falls back to environment variables", () => {
    const config = resolveRuntimeConfig([], {
      MCP_HOST: "0.0.0.0",
      MCP_PATH: "/mcp-http",
      MCP_PORT: "9000",
      MCP_TRANSPORT: "http",
    });

    expect(config).toEqual({
      host: "0.0.0.0",
      path: "/mcp-http",
      port: 9000,
      transport: "http",
    });
  });

  it("defaults to stdio when no transport is provided", () => {
    expect(resolveRuntimeConfig([], {})).toEqual({
      host: "0.0.0.0",
      path: "/mcp",
      port: 3000,
      transport: "stdio",
    });
  });

  it("throws for unsupported transports", () => {
    expect(() => resolveRuntimeConfig(["--transport", "sse"], {})).toThrow(
      "Unsupported transport: sse",
    );
  });

  it("throws for invalid ports", () => {
    expect(() => resolveRuntimeConfig(["--port", "abc"], {})).toThrow(
      "Invalid port: abc",
    );
  });
});
