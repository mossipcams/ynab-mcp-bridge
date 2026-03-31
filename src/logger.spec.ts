import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger, logEvent } from "./logger.js";

function createBufferedDestination() {
  const destination = new PassThrough();
  const chunks: string[] = [];

  destination.on("data", (chunk) => {
    chunks.push(chunk.toString("utf8"));
  });

  return {
    destination,
    readRaw() {
      return chunks.join("");
    },
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

describe("logger", () => {
  it("emits structured scoped events and redacts sensitive fields", () => {
    const sink = createBufferedDestination();
    const logger = createLogger({
      destination: sink.destination,
    });

    logEvent(logger, "oauth", "token.refresh.failed", {
      authorization: "Bearer top-secret",
      clientSecret: "client-secret-value",
      nested: {
        refreshToken: "refresh-secret",
      },
      path: "/token",
    });

    expect(sink.readEntries()).toHaveLength(1);
    expect(sink.readEntries()[0]).toMatchObject({
      authorization: "[Redacted]",
      clientSecret: "[Redacted]",
      event: "token.refresh.failed",
      msg: "token.refresh.failed",
      nested: {
        refreshToken: "[Redacted]",
      },
      path: "/token",
      scope: "oauth",
    });
  });

  it("can wrap emitted log lines for journal-friendly output when requested", () => {
    const sink = createBufferedDestination();
    const logger = createLogger({
      destination: sink.destination,
      wrapWidth: 80,
    });

    logEvent(logger, "auth2", "wrap.test", {
      detail: "x".repeat(240),
    });

    const raw = sink.readRaw().trimEnd();

    expect(raw.includes("\n")).toBe(true);
    expect(raw.split("\n").every((line) => line.length <= 80)).toBe(true);
  });
});
