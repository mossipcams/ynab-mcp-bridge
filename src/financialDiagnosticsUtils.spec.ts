import { describe, expect, it } from "vitest";

import {
  previousMonths,
  recentMonths,
} from "./tools/financialDiagnosticsUtils.js";

describe("financial diagnostics helpers", () => {
  it("treats negative month windows as empty", () => {
    expect(recentMonths([
      { month: "2024-03-01" },
      { month: "2024-02-01" },
    ], "2024-03-01", -1)).toEqual([]);
  });

  it("treats negative previous-month counts as empty", () => {
    expect(previousMonths("2024-03-01", -2)).toEqual([]);
  });
});
