import { afterEach, describe, expect, it } from "vitest";

import { getPlanId } from "./tools/planToolUtils.js";

describe("planToolUtils", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers the explicit planId input", () => {
    process.env = { ...originalEnv, YNAB_PLAN_ID: "plan-env" };

    expect(getPlanId("plan-input")).toBe("plan-input");
  });

  it("falls back to YNAB_PLAN_ID", () => {
    process.env = { ...originalEnv, YNAB_PLAN_ID: "plan-env" };

    expect(getPlanId()).toBe("plan-env");
  });

  it("does not fall back to YNAB_BUDGET_ID", () => {
    process.env = { ...originalEnv, YNAB_BUDGET_ID: "budget-env" };

    expect(() => getPlanId()).toThrow("No plan ID provided. Please provide a plan ID or set YNAB_PLAN_ID.");
  });
});
