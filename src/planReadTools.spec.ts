import { afterEach, describe, expect, it, vi } from "vitest";

import * as GetPlanDetailsTool from "./tools/GetPlanDetailsTool.js";
import * as GetPlanMonthTool from "./tools/GetPlanMonthTool.js";
import * as GetPlanSettingsTool from "./tools/GetPlanSettingsTool.js";
import * as ListPlansTool from "./tools/ListPlansTool.js";

function parseResponseText(result: Awaited<ReturnType<typeof ListPlansTool.execute>>) {
  return JSON.parse(result.content[0].text);
}

describe("plan read tools", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("lists plans from the v4 SDK surface", async () => {
    const api = {
      plans: {
        getPlans: vi.fn().mockResolvedValue({
          data: {
            plans: [
              { id: "plan-1", name: "Home", last_modified_on: "2026-03-01" },
            ],
            default_plan: { id: "plan-1", name: "Home" },
          },
        }),
      },
    };

    const result = await ListPlansTool.execute({}, api as any);

    expect(api.plans.getPlans).toHaveBeenCalledOnce();
    expect(parseResponseText(result)).toEqual({
      plans: [
        { id: "plan-1", name: "Home", last_modified_on: "2026-03-01" },
      ],
      default_plan: { id: "plan-1", name: "Home" },
    });
  });

  it("gets a single plan by id", async () => {
    const api = {
      plans: {
        getPlanById: vi.fn().mockResolvedValue({
          data: {
            plan: {
              id: "plan-1",
              name: "Home",
              accounts: [],
              category_groups: [],
            },
          },
        }),
      },
    };

    const result = await GetPlanDetailsTool.execute({ planId: "plan-1" }, api as any);

    expect(api.plans.getPlanById).toHaveBeenCalledWith("plan-1", undefined);
    expect(parseResponseText(result)).toEqual({
      plan: {
        id: "plan-1",
        name: "Home",
        accounts: [],
        category_groups: [],
      },
    });
  });

  it("gets plan settings using the env fallback when needed", async () => {
    process.env = { ...originalEnv, YNAB_PLAN_ID: "plan-env" };
    const api = {
      plans: {
        getPlanSettingsById: vi.fn().mockResolvedValue({
          data: {
            settings: {
              date_format: { format: "MM/DD/YYYY" },
              currency_format: { iso_code: "USD" },
            },
          },
        }),
      },
    };

    const result = await GetPlanSettingsTool.execute({}, api as any);

    expect(api.plans.getPlanSettingsById).toHaveBeenCalledWith("plan-env");
    expect(parseResponseText(result)).toEqual({
      settings: {
        date_format: { format: "MM/DD/YYYY" },
        currency_format: { iso_code: "USD" },
      },
    });
  });

  it("gets a plan month snapshot", async () => {
    const api = {
      months: {
        getPlanMonth: vi.fn().mockResolvedValue({
          data: {
            month: {
              month: "2026-03-01",
              income: 100000,
              budgeted: 40000,
              activity: 30000,
              to_be_budgeted: 60000,
            },
          },
        }),
      },
    };

    const result = await GetPlanMonthTool.execute(
      { planId: "plan-1", month: "2026-03-01" },
      api as any,
    );

    expect(api.months.getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(parseResponseText(result)).toEqual({
      month: {
        month: "2026-03-01",
        income: 100000,
        budgeted: 40000,
        activity: 30000,
        to_be_budgeted: 60000,
      },
    });
  });
});
