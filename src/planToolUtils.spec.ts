import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { toErrorResult, toTextResult, withResolvedPlan } from "./tools/planToolUtils.js";

describe("plan tool response helpers", () => {
  it("serializes payloads as compact JSON by default", () => {
    const result = toTextResult({
      status: "ok",
      metrics: {
        net_worth: "123.45",
      },
    });

    expect(result).toEqual({
      content: [{
        type: "text",
        text: "{\"status\":\"ok\",\"metrics\":{\"net_worth\":\"123.45\"}}",
      }],
    });
  });

  it("can still serialize payloads as pretty JSON when requested", () => {
    const result = toTextResult(
      {
        status: "ok",
        metrics: {
          net_worth: "123.45",
        },
      },
      "pretty",
    );

    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "{",
          "  \"status\": \"ok\",",
          "  \"metrics\": {",
          "    \"net_worth\": \"123.45\"",
          "  }",
          "}",
        ].join("\n"),
      }],
    });
  });

  it("keeps error payloads compact by default", () => {
    const result = toErrorResult(new Error("Bad request"));

    expect(result).toEqual({
      isError: true,
      content: [{
        type: "text",
        text: "{\"success\":false,\"error\":\"Bad request\"}",
      }],
    });
  });

  it("resolves the default plan independently for each call when no explicit plan id is provided", async () => {
    let availablePlanIds = ["plan-a"];
    const api = {
      plans: {
        async getPlans() {
          return {
            data: {
              plans: availablePlanIds.map((id) => ({ id })),
              default_plan: { id: availablePlanIds[0] },
            },
          };
        },
      },
    };

    await expect(withResolvedPlan(undefined, api, async (planId) => planId, {
      configuredPlanId: "plan-a",
    })).resolves.toBe("plan-a");

    availablePlanIds = ["plan-b"];

    await expect(withResolvedPlan(undefined, api, async (planId) => planId, {
      configuredPlanId: "plan-b",
    })).resolves.toBe("plan-b");
  });

  it("deduplicates concurrent default-plan discovery without caching completed results across calls", async () => {
    let resolvePlans: ((value: {
      data: {
        plans: Array<{ id: string }>;
        default_plan?: { id: string };
      };
    }) => void) | undefined;
    let getPlansCalls = 0;
    const api = {
      plans: {
        async getPlans() {
          getPlansCalls += 1;

          return await new Promise<{
            data: {
              plans: Array<{ id: string }>;
              default_plan?: { id: string };
            };
          }>((resolve) => {
            resolvePlans = resolve;
          });
        },
      },
    };

    const first = withResolvedPlan(undefined, api, async (planId) => planId);
    const second = withResolvedPlan(undefined, api, async (planId) => planId);
    const third = withResolvedPlan(undefined, api, async (planId) => planId);

    expect(getPlansCalls).toBe(1);

    resolvePlans?.({
      data: {
        plans: [{ id: "plan-a" }],
        default_plan: { id: "plan-a" },
      },
    });

    await expect(Promise.all([first, second, third])).resolves.toEqual(["plan-a", "plan-a", "plan-a"]);

    const followUp = withResolvedPlan(undefined, api, async (planId) => planId);
    expect(getPlansCalls).toBe(2);

    resolvePlans?.({
      data: {
        plans: [{ id: "plan-a" }],
        default_plan: { id: "plan-a" },
      },
    });

    await expect(followUp).resolves.toBe("plan-a");
  });

  it("keeps configured-plan lookup explicit instead of importing ynab runtime context", async () => {
    const source = readFileSync(new URL("./tools/planToolUtils.ts", import.meta.url), "utf8");

    expect(source).not.toContain("../ynabApi.js");
    expect(source).toContain("configuredPlanId");

    const api = {
      plans: {
        async getPlans() {
          return {
            data: {
              plans: [{ id: "plan-a" }],
              default_plan: { id: "plan-a" },
            },
          };
        },
      },
    };

    await expect(withResolvedPlan(undefined, api, async (planId) => planId, {
      configuredPlanId: "configured-plan",
    })).resolves.toBe("configured-plan");
  });
});
