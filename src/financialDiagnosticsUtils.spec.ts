import { describe, expect, it, vi } from "vitest";

import {
  averageDailyOutflowMilliunits,
  averageMonthlySpendingMilliunits,
  compactRisk,
  daysUntil,
  formatAmount,
  formatPercent,
  formatRatio,
  liquidCashMilliunits,
  netWorthMilliunits,
  previousMonths,
  recentMonths,
  spreadPercent,
  totalDebtMilliunits,
} from "./tools/financialDiagnosticsUtils.js";

describe("financial diagnostics utils", () => {
  it("calculates liquid cash, debt, and net worth from active accounts", () => {
    const accounts = [
      { id: "a1", name: "Checking", on_budget: true, balance: 250_000 },
      { id: "a2", name: "Savings", on_budget: true, balance: 750_000 },
      { id: "a3", name: "Credit Card", on_budget: true, balance: -125_000 },
      { id: "a4", name: "Closed", on_budget: true, balance: 999_000, closed: true },
      { id: "a5", name: "Tracking", on_budget: false, balance: 100_000 },
    ];

    expect(liquidCashMilliunits(accounts)).toBe(1_000_000);
    expect(totalDebtMilliunits(accounts)).toBe(125_000);
    expect(netWorthMilliunits(accounts)).toBe(975_000);
  });

  it("selects recent non-deleted months and computes spending averages", () => {
    const months = recentMonths([
      { month: "2026-01-01", activity: -120_000 },
      { month: "2026-03-01", activity: -90_000 },
      { month: "2026-02-01", activity: -150_000 },
      { month: "2025-12-01", activity: -80_000, deleted: true },
      { month: "2026-04-01", activity: -200_000 },
    ], "2026-03-01", 2);

    expect(months).toEqual([
      { month: "2026-03-01", activity: -90_000 },
      { month: "2026-02-01", activity: -150_000 },
    ]);
    expect(averageMonthlySpendingMilliunits(months)).toBe(120_000);
    expect(averageDailyOutflowMilliunits(months)).toBe(4_000);
  });

  it("formats compact diagnostics values consistently", () => {
    expect(spreadPercent([100, 200, 300])).toBe(100);
    expect(formatPercent(12.345)).toBe("12.35");
    expect(formatRatio(1.234)).toBe("1.23");
    expect(formatAmount(125_000)).toBe("125.00");
    expect(compactRisk("cash_shortfall", "high")).toEqual({
      code: "cash_shortfall",
      severity: "high",
    });
  });

  it("computes day and month windows from ISO date inputs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T18:00:00.000Z"));

    expect(daysUntil("2026-03-25", "2026-04-01")).toBe(7);
    expect(previousMonths("2026-03-01", 3)).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);

    vi.useRealTimers();
  });
});
