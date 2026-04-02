import { afterEach, describe, expect, it, vi } from "vitest";

import * as GetPlanDetailsTool from "./features/plans/GetPlanDetailsTool.js";
import * as GetPlanMonthTool from "./features/plans/GetPlanMonthTool.js";
import * as GetPlanSettingsTool from "./features/plans/GetPlanSettingsTool.js";
import * as ListPlanMonthsTool from "./features/plans/ListPlanMonthsTool.js";
import * as ListPlansTool from "./features/plans/ListPlansTool.js";
import { attachYnabApiRuntimeContext } from "./ynabApi.js";
import { toPlanId } from "./ynabTypes.js";

function parseResponseText(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

function requirePlanId(value: string) {
  const planId = toPlanId(value);

  if (!planId) {
    throw new Error(`Expected valid plan id: ${value}`);
  }

  return planId;
}

describe("plan read tools", () => {
  afterEach(() => {
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
        account_count: 0,
        category_group_count: 0,
      },
    });
  });

  it("can still return the full plan payload when explicitly requested", async () => {
    const api = {
      plans: {
        getPlanById: vi.fn().mockResolvedValue({
          data: {
            plan: {
              id: "plan-1",
              name: "Home",
              accounts: [{ id: "acct-1" }],
              category_groups: [{ id: "group-1" }],
            },
          },
        }),
      },
    };

    const result = await GetPlanDetailsTool.execute({ planId: "plan-1", view: "full" }, api as any);

    expect(api.plans.getPlanById).toHaveBeenCalledWith("plan-1", undefined);
    expect(parseResponseText(result)).toEqual({
      plan: {
        id: "plan-1",
        name: "Home",
        accounts: [{ id: "acct-1" }],
        category_groups: [{ id: "group-1" }],
      },
    });
  });

  it("gets plan settings using the env fallback when needed", async () => {
    const plans = {
      getPlanSettingsById: vi.fn().mockResolvedValue({
        data: {
          settings: {
            date_format: { format: "MM/DD/YYYY" },
            currency_format: { iso_code: "USD" },
          },
        },
      }),
    };
    const api = attachYnabApiRuntimeContext({
      plans,
    }, {
      apiToken: "token-1",
      planId: requirePlanId("plan-env"),
    });

    const result = await GetPlanSettingsTool.execute({}, api as any);

    expect(plans.getPlanSettingsById).toHaveBeenCalledWith("plan-env");
    expect(parseResponseText(result)).toEqual({
      settings: {
        date_format: { format: "MM/DD/YYYY" },
        currency_format: { iso_code: "USD" },
      },
    });
  });

  it("gets plan settings using the YNAB default plan when no plan is configured", async () => {
    const api = attachYnabApiRuntimeContext({
      plans: {
        getPlans: vi.fn().mockResolvedValue({
          data: {
            plans: [
              { id: "plan-1", name: "Home" },
              { id: "plan-2", name: "Work" },
            ],
            default_plan: { id: "plan-2", name: "Work" },
          },
        }),
        getPlanSettingsById: vi.fn().mockResolvedValue({
          data: {
            settings: {
              date_format: { format: "MM/DD/YYYY" },
              currency_format: { iso_code: "USD" },
            },
          },
        }),
      },
    }, {
      apiToken: "token-1",
    });

    const result = await GetPlanSettingsTool.execute({}, api as any);

    expect(api.plans.getPlans).toHaveBeenCalledOnce();
    expect(api.plans.getPlanSettingsById).toHaveBeenCalledWith("plan-2");
    expect(parseResponseText(result)).toEqual({
      settings: {
        date_format: { format: "MM/DD/YYYY" },
        currency_format: { iso_code: "USD" },
      },
    });
  });

  it("recovers from a stale configured plan id by resolving a fresh default plan", async () => {
    const plans = {
      getPlans: vi.fn().mockResolvedValue({
        data: {
          plans: [
            { id: "plan-2", name: "Work" },
          ],
          default_plan: { id: "plan-2", name: "Work" },
        },
      }),
      getPlanSettingsById: vi
        .fn()
        .mockRejectedValueOnce({
          error: {
            name: "not_found",
            detail: "Plan not found",
          },
        })
        .mockResolvedValueOnce({
          data: {
            settings: {
              date_format: { format: "MM/DD/YYYY" },
              currency_format: { iso_code: "USD" },
            },
          },
        }),
    };
    const api = attachYnabApiRuntimeContext({
      plans,
    }, {
      apiToken: "token-1",
      planId: requirePlanId("plan-stale"),
    });

    const result = await GetPlanSettingsTool.execute({}, api as any);

    expect(plans.getPlanSettingsById).toHaveBeenNthCalledWith(1, "plan-stale");
    expect(plans.getPlans).toHaveBeenCalledOnce();
    expect(plans.getPlanSettingsById).toHaveBeenNthCalledWith(2, "plan-2");
    expect(parseResponseText(result)).toEqual({
      settings: {
        date_format: { format: "MM/DD/YYYY" },
        currency_format: { iso_code: "USD" },
      },
    });
  });

  it("does not override an explicit invalid plan id", async () => {
    const plans = {
      getPlans: vi.fn(),
      getPlanSettingsById: vi.fn().mockRejectedValue({
        error: {
          name: "not_found",
          detail: "Plan not found",
        },
      }),
    };
    const api = attachYnabApiRuntimeContext({
      plans,
    }, {
      apiToken: "token-1",
      planId: requirePlanId("plan-env"),
    });

    const result = await GetPlanSettingsTool.execute({ planId: "plan-explicit" }, api as any);

    expect(plans.getPlanSettingsById).toHaveBeenCalledOnce();
    expect(plans.getPlanSettingsById).toHaveBeenCalledWith("plan-explicit");
    expect(plans.getPlans).not.toHaveBeenCalled();
    expect("isError" in result && result.isError).toBe(true);
    expect(parseResponseText(result)).toEqual({
      success: false,
      error: "Plan not found",
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

  it("can still return the full plan month payload when explicitly requested", async () => {
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
              categories: [{ id: "cat-1", name: "Rent" }],
            },
          },
        }),
      },
    };

    const result = await GetPlanMonthTool.execute(
      { planId: "plan-1", month: "2026-03-01", view: "full" },
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
        categories: [{ id: "cat-1", name: "Rent" }],
      },
    });
  });

  it("lists plan month summaries", async () => {
    const api = {
      months: {
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              {
                month: "2026-03-01",
                income: 100000,
                budgeted: 40000,
                activity: 30000,
                to_be_budgeted: 60000,
                deleted: false,
              },
              {
                month: "2026-02-01",
                income: 90000,
                budgeted: 35000,
                activity: 28000,
                to_be_budgeted: 55000,
                deleted: true,
              },
            ],
          },
        }),
      },
    };

    const result = await ListPlanMonthsTool.execute({ planId: "plan-1" }, api as any);

    expect(api.months.getPlanMonths).toHaveBeenCalledWith("plan-1");
    expect(parseResponseText(result)).toEqual({
      months: [
        {
          month: "2026-03-01",
          income: 100000,
          budgeted: 40000,
          activity: 30000,
          to_be_budgeted: 60000,
        },
      ],
      month_count: 1,
    });
  });

  it("projects plan month fields without paginating when no limit or offset is provided", async () => {
    const api = {
      months: {
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              {
                month: "2026-03-01",
                income: 100000,
                budgeted: 40000,
                activity: 30000,
                to_be_budgeted: 60000,
                deleted: false,
              },
              {
                month: "2026-02-01",
                income: 90000,
                budgeted: 35000,
                activity: 28000,
                to_be_budgeted: 55000,
                deleted: false,
              },
            ],
          },
        }),
      },
    };

    const result = await ListPlanMonthsTool.execute(
      { planId: "plan-1", fields: ["month", "income"] },
      api as any,
    );

    expect(parseResponseText(result)).toEqual({
      months: [
        {
          month: "2026-03-01",
          income: 100000,
        },
        {
          month: "2026-02-01",
          income: 90000,
        },
      ],
      month_count: 2,
    });
  });
});
