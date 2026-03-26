import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createYnabApi, getYnabApiRuntimeContext } from "./ynabApi.js";
import { SlidingWindowRateLimiter } from "./ynabRateLimiter.js";

describe("createYnabApi rate limiting", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("requires explicit config instead of reading the API token from environment", () => {
    process.env = { ...originalEnv, YNAB_API_TOKEN: "  token-a  " };

    expect(() => (createYnabApi as any)()).toThrow("YNAB config is required.");
  });

  it("retries 429 responses using retry-after before succeeding", async () => {
    const fetchApi = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: {
            "retry-after": "2",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const api = createYnabApi("token-a", {
      fetchApi,
      rateLimiter: new SlidingWindowRateLimiter({
        maxRequests: 200,
        windowMs: 60 * 60 * 1000,
      }),
    }) as any;

    const request = api._configuration.fetchApi("https://api.ynab.com/v1/plans", {
      method: "GET",
    });

    await vi.advanceTimersByTimeAsync(2_000);
    const response = await request;

    expect(response.status).toBe(200);
    expect(fetchApi).toHaveBeenCalledTimes(2);
  });

  it("attaches the explicit plan config to the API runtime context", () => {
    const api = createYnabApi({
      apiToken: " token-a ",
      planId: " plan-1 ",
    });

    expect(getYnabApiRuntimeContext(api)).toEqual({
      config: {
        apiToken: "token-a",
        planId: "plan-1",
      },
    });
  });

  it("throttles requests through the shared limiter before calling fetch", async () => {
    const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const api = createYnabApi("token-a", {
      fetchApi,
      rateLimiter: new SlidingWindowRateLimiter({
        maxRequests: 1,
        windowMs: 1_000,
      }),
    }) as any;

    await api._configuration.fetchApi("https://api.ynab.com/v1/plans", {
      method: "GET",
    });

    let settled = false;
    const secondRequest = api._configuration
      .fetchApi("https://api.ynab.com/v1/plans", {
        method: "GET",
      })
      .then(() => {
        settled = true;
      });

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await secondRequest;

    expect(fetchApi).toHaveBeenCalledTimes(2);
  });
});
