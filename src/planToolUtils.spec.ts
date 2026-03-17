import { describe, expect, it } from "vitest";

import { attachYnabApiRuntimeContext } from "./ynabApi.js";
import {
  buildCompactListPayload,
  compactResultItem,
  getPlanId,
  resolvePlanId,
  toErrorResult,
  toTextResult,
} from "./tools/planToolUtils.js";

describe("planToolUtils", () => {
  it("prefers the explicit planId input", () => {
    expect(getPlanId("plan-input", "plan-env")).toBe("plan-input");
  });

  it("falls back to YNAB_PLAN_ID", () => {
    expect(getPlanId(undefined, "plan-env")).toBe("plan-env");
  });

  it("does not fall back to YNAB_BUDGET_ID", () => {
    expect(() => getPlanId()).toThrow("No plan ID provided. Please provide a plan ID or set YNAB_PLAN_ID.");
  });

  it("ignores a whitespace-only YNAB_PLAN_ID", async () => {
    const api = attachYnabApiRuntimeContext({
      plans: {
        getPlans: async () => ({
          data: {
            plans: [
              { id: "plan-1", name: "Home" },
            ],
            default_plan: undefined,
          },
        }),
      },
    }, {
      apiToken: "token-1",
      planId: "   ",
    });

    expect(() => getPlanId(undefined, "   ")).toThrow("No plan ID provided. Please provide a plan ID or set YNAB_PLAN_ID.");
    await expect(resolvePlanId(undefined, api)).resolves.toBe("plan-1");
  });

  it("resolves the YNAB default plan when no planId is configured", async () => {
    const api = attachYnabApiRuntimeContext({
      plans: {
        getPlans: async () => ({
          data: {
            plans: [
              { id: "plan-1", name: "Home" },
              { id: "plan-2", name: "Work" },
            ],
            default_plan: { id: "plan-2", name: "Work" },
          },
        }),
      },
    }, {
      apiToken: "token-1",
    });

    await expect(resolvePlanId(undefined, api)).resolves.toBe("plan-2");
  });

  it("resolves the only available plan when no default is returned", async () => {
    const api = attachYnabApiRuntimeContext({
      plans: {
        getPlans: async () => ({
          data: {
            plans: [
              { id: "plan-1", name: "Home" },
            ],
            default_plan: undefined,
          },
        }),
      },
    }, {
      apiToken: "token-1",
    });

    await expect(resolvePlanId(undefined, api)).resolves.toBe("plan-1");
  });

  it("keeps resolved plan overrides scoped to each API instance", async () => {
    const firstApi = attachYnabApiRuntimeContext({
      plans: {
        getPlans: async () => ({
          data: {
            plans: [
              { id: "plan-1", name: "Home" },
            ],
            default_plan: undefined,
          },
        }),
      },
    }, {
      apiToken: "token-1",
    });
    const secondApi = attachYnabApiRuntimeContext({
      plans: {
        getPlans: async () => ({
          data: {
            plans: [
              { id: "plan-2", name: "Work" },
            ],
            default_plan: undefined,
          },
        }),
      },
    }, {
      apiToken: "token-2",
    });

    await expect(resolvePlanId(undefined, firstApi)).resolves.toBe("plan-1");
    await expect(resolvePlanId(undefined, secondApi)).resolves.toBe("plan-2");
  });

  it("fails clearly when no plan can be resolved", async () => {
    const api = attachYnabApiRuntimeContext({
      plans: {
        getPlans: async () => ({
          data: {
            plans: [],
            default_plan: undefined,
          },
        }),
      },
    }, {
      apiToken: "token-1",
    });

    await expect(resolvePlanId(undefined, api)).rejects.toThrow(
      "No plan ID provided. Please provide a plan ID, set YNAB_PLAN_ID, or configure a default YNAB plan.",
    );
  });

  it("serializes tool payloads without pretty-print whitespace", () => {
    expect(toTextResult({
      plan: {
        id: "plan-1",
        name: "Home",
      },
    })).toEqual({
      content: [{
        type: "text",
        text: "{\"plan\":{\"id\":\"plan-1\",\"name\":\"Home\"}}",
      }],
    });
  });

  it("returns compact parseable error payloads", () => {
    const result = toErrorResult(new Error("Plan not found"));

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{
      type: "text",
      text: "{\"success\":false,\"error\":\"Plan not found\"}",
    }]);
    expect(JSON.parse(result.content[0].text)).toEqual({
      success: false,
      error: "Plan not found",
    });
  });

  it("removes empty and default fields from compact result items", () => {
    expect(compactResultItem({
      id: "tx-1",
      memo: null,
      approved: true,
      cleared: "uncleared",
      flag_name: "",
      transfer_account_id: undefined,
      amount: "12.34",
    }, {
      emptyStringKeys: ["flag_name"],
      omitWhenEqual: {
        approved: true,
        cleared: "uncleared",
      },
    })).toEqual({
      id: "tx-1",
      amount: "12.34",
    });
  });

  it("builds compact bounded list payloads with pagination metadata", () => {
    expect(buildCompactListPayload("transactions", [
      { id: "tx-1", amount: "10.00" },
      { id: "tx-2", amount: "20.00" },
      { id: "tx-3", amount: "30.00" },
    ], 2)).toEqual({
      transactions: [
        { id: "tx-1", amount: "10.00" },
        { id: "tx-2", amount: "20.00" },
      ],
      returned_count: 2,
      total_count: 3,
      has_more: true,
    });
  });
});
