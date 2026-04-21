import { describe, expect, it } from "vitest";

import {
  createAnalysisSession,
  getAnalysisSession,
  type AnalysisSessionRecord,
} from "./financialAnalysisState.js";

describe("financial analysis state", () => {
  it("stores and retrieves analysis sessions by token", () => {
    const api = {};
    const session = createAnalysisSession(api, {
      kind: "spending_change",
      planId: "plan-1",
      payload: {
        period_a: { from_month: "2026-02-01", to_month: "2026-02-01" },
      },
    }, { now: "2026-04-20T12:00:00.000Z" });

    expect(session.token).toBeTruthy();
    expect(getAnalysisSession(api, session.token, { now: "2026-04-20T12:05:00.000Z" })).toEqual(
      expect.objectContaining({
        token: session.token,
        kind: "spending_change",
        planId: "plan-1",
        payload: {
          period_a: { from_month: "2026-02-01", to_month: "2026-02-01" },
        },
      } satisfies Partial<AnalysisSessionRecord>),
    );
  });

  it("expires analysis sessions after the configured ttl", () => {
    const api = {};
    const session = createAnalysisSession(api, {
      kind: "spending_change",
      planId: "plan-1",
      payload: { summary: true },
    }, { now: "2026-04-20T12:00:00.000Z", ttlMs: 60_000 });

    expect(getAnalysisSession(api, session.token, { now: "2026-04-20T12:00:30.000Z" })).toBeDefined();
    expect(getAnalysisSession(api, session.token, { now: "2026-04-20T12:01:01.000Z" })).toBeUndefined();
  });

  it("returns undefined for unknown tokens", () => {
    expect(getAnalysisSession({}, "analysis_missing")).toBeUndefined();
  });
});
