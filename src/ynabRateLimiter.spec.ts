import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SlidingWindowRateLimiter } from "./ynabRateLimiter.js";

describe("SlidingWindowRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests immediately while under the limit", async () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
    });

    await expect(limiter.acquire("token-a")).resolves.toBeUndefined();
    await expect(limiter.acquire("token-a")).resolves.toBeUndefined();
  });

  it("waits until the rolling window clears before allowing another request", async () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
    });

    await limiter.acquire("token-a");
    await limiter.acquire("token-a");

    let settled = false;
    const pendingAcquire = limiter.acquire("token-a").then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await pendingAcquire;

    expect(settled).toBe(true);
  });

  it("tracks different access tokens independently", async () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
    });

    await limiter.acquire("token-a");
    await expect(limiter.acquire("token-b")).resolves.toBeUndefined();
  });
});
