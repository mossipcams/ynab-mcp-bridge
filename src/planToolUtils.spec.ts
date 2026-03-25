import { describe, expect, it, vi } from "vitest";

import { attachYnabApiRuntimeContext } from "./ynabApi.js";
import { withResolvedPlan } from "./tools/planToolUtils.js";

describe("withResolvedPlan", () => {
  it("does not let an auto-resolved plan bleed into a later call on the same API instance", async () => {
    let plans = [{ id: "plan-a" }];
    const api = attachYnabApiRuntimeContext({
      plans: {
        getPlans: vi.fn(async () => ({
          data: {
            plans,
            default_plan: plans[0],
          },
        })),
      },
    }, {
      apiToken: "token-a",
    });

    await expect(withResolvedPlan(undefined, api as never, async (planId) => planId)).resolves.toBe("plan-a");

    plans = [{ id: "plan-b" }];

    await expect(withResolvedPlan(undefined, api as never, async (planId) => planId)).resolves.toBe("plan-b");
  });
});
