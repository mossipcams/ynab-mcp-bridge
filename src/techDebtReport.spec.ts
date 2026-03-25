import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("tech debt report", () => {
  it("formats the duplicate-remediation tracking metrics with a whole-codebase duplication headline", async () => {
    const scriptUrl = new URL("../scripts/tech-debt-report.mjs", import.meta.url);

    expect(existsSync(scriptUrl)).toBe(true);

    const { formatTechDebtReport } = await import(scriptUrl.href) as {
      formatTechDebtReport: (metrics: {
        duplication: string;
        deadExports: number;
        tsIgnoreCount: number;
        eslintDisableCount: number;
        todoCount: number;
      }) => string;
    };

    expect(formatTechDebtReport({
      duplication: "24.35",
      deadExports: 0,
      tsIgnoreCount: 4,
      eslintDisableCount: 5,
      todoCount: 2,
    })).toContain(`=== Tech Debt Report ===
Whole-codebase duplication: 24.35%
Dead exports: 0
ts-ignore count: 4
eslint-disable count: 5
TODO/FIXME/HACK count: 2`);
  });
});
