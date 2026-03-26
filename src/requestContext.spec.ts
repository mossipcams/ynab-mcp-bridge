import { describe, expect, it } from "vitest";

import {
  createRequestContext,
  getRequestContext,
  getRequestLogFields,
  hasToolCallStarted,
  markToolCallStarted,
  runWithRequestContext,
} from "./requestContext.js";

describe("request context", () => {
  it("uses the first correlation id from a comma-separated header value", () => {
    const context = createRequestContext({
      "x-correlation-id": "trace-123, trace-456",
    });

    expect(context.correlationId).toBe("trace-123");
  });

  it("uses the first correlation id from a comma-separated array header value", () => {
    const context = createRequestContext({
      "x-correlation-id": ["trace-123, trace-456"],
    });

    expect(context.correlationId).toBe("trace-123");
  });

  it("provides request ids and correlation ids to the active async context", () => {
    const value = runWithRequestContext({
      correlationId: "trace-123",
      requestId: "request-456",
    }, () => ({
      fields: getRequestLogFields(),
      stored: getRequestContext(),
    }));

    expect(value).toEqual({
      fields: {
        correlationId: "trace-123",
        requestId: "request-456",
      },
      stored: {
        correlationId: "trace-123",
        requestId: "request-456",
        toolCallStarted: false,
      },
    });
  });

  it("tracks when a wrapped request has started a tool call", () => {
    const value = runWithRequestContext({
      correlationId: "trace-123",
      requestId: "request-456",
    }, () => {
      const before = hasToolCallStarted();
      markToolCallStarted();
      const after = hasToolCallStarted();

      return { after, before };
    });

    expect(value).toEqual({
      after: true,
      before: false,
    });
  });
});
