import { describe, expect, it, vi } from "vitest";

import {
  getCachedAccounts,
  getCachedPlanMonth,
  getCachedPlanMonths,
} from "./cachedYnabReads.js";

describe("cached YNAB reads", () => {
  it("reuses a resolved account read for the same plan id", async () => {
    const getAccounts = vi.fn().mockResolvedValue({
      data: {
        accounts: [{ id: "acct-1" }],
      },
    });
    const api = {
      accounts: {
        getAccounts,
      },
    };

    await expect(Promise.all([
      getCachedAccounts(api as any, "plan-1"),
      getCachedAccounts(api as any, "plan-1"),
    ])).resolves.toEqual([
      {
        data: {
          accounts: [{ id: "acct-1" }],
        },
      },
      {
        data: {
          accounts: [{ id: "acct-1" }],
        },
      },
    ]);
    expect(getAccounts).toHaveBeenCalledTimes(1);
  });

  it("evicts a rejected plan-month read so a follow-up retry can succeed", async () => {
    const getPlanMonth = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce({
        data: {
          month: {
            month: "2026-03-01",
          },
        },
      });
    const api = {
      months: {
        getPlanMonth,
      },
    };

    await expect(getCachedPlanMonth(api as any, "plan-1", "2026-03-01")).rejects.toThrow("temporary outage");
    await expect(getCachedPlanMonth(api as any, "plan-1", "2026-03-01")).resolves.toEqual({
      data: {
        month: {
          month: "2026-03-01",
        },
      },
    });
    expect(getPlanMonth).toHaveBeenCalledTimes(2);
  });

  it("keeps cache keys separate across different plan-month queries", async () => {
    const getPlanMonths = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          months: [{ month: "2026-03-01" }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          months: [{ month: "2026-04-01" }],
        },
      });
    const api = {
      months: {
        getPlanMonths,
      },
    };

    await expect(getCachedPlanMonths(api as any, "plan-1")).resolves.toEqual({
      data: {
        months: [{ month: "2026-03-01" }],
      },
    });
    await expect(getCachedPlanMonths(api as any, "plan-2")).resolves.toEqual({
      data: {
        months: [{ month: "2026-04-01" }],
      },
    });
    expect(getPlanMonths).toHaveBeenCalledTimes(2);
  });
});
