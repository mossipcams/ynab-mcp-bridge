import { describe, expect, it } from "vitest";

import { attachYnabApiRuntimeContext } from "./ynabApi.js";
import { withResolvedPlan } from "./runtimePlanToolUtils.js";

describe("runtime plan tool utils", () => {
  it("prefers an explicit plan id over attached runtime context", async () => {
    const api = attachYnabApiRuntimeContext({
      plans: {
        async getPlans() {
          throw new Error("getPlans should not be needed for explicit plan ids");
        },
      },
    }, {
      apiToken: "token-a",
      planId: "plan-from-context",
    });

    await expect(withResolvedPlan("plan-explicit", api, async (planId) => planId)).resolves.toBe("plan-explicit");
  });

  it("uses the attached runtime context when no explicit plan id is provided", async () => {
    const api = attachYnabApiRuntimeContext({
      plans: {
        async getPlans() {
          throw new Error("getPlans should not be needed when runtime context has a plan id");
        },
      },
    }, {
      apiToken: "token-a",
      planId: "plan-from-context",
    });

    await expect(withResolvedPlan(undefined, api, async (planId) => planId)).resolves.toBe("plan-from-context");
  });
});
