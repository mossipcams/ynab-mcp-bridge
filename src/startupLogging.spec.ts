import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "./logger.js";
import {
  logHttpServerStarted,
  logStartupFailure,
  logStdioServerStarted,
} from "./startupLogging.js";

function createBufferedDestination() {
  const destination = new PassThrough();
  const chunks: string[] = [];

  destination.on("data", (chunk) => {
    chunks.push(chunk.toString("utf8"));
  });

  return {
    destination,
    readEntries() {
      return chunks
        .join("")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

describe("startup logging", () => {
  it("emits structured startup events for both transports and failures", () => {
    const sink = createBufferedDestination();
    const logger = createLogger({
      destination: sink.destination,
    });

    logHttpServerStarted("http://127.0.0.1:3000/mcp", logger);
    logStdioServerStarted(logger);
    logStartupFailure(new Error("boom"), logger);

    expect(sink.readEntries()).toEqual([
      expect.objectContaining({
        event: "server.started",
        msg: "server.started",
        scope: "startup",
        transport: "http",
        url: "http://127.0.0.1:3000/mcp",
      }),
      expect.objectContaining({
        event: "server.started",
        msg: "server.started",
        scope: "startup",
        transport: "stdio",
      }),
      expect.objectContaining({
        error: {
          message: "boom",
          name: "Error",
        },
        event: "startup.failed",
        msg: "startup.failed",
        scope: "startup",
      }),
    ]);
  });
});
