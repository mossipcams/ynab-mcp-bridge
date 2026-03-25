import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("tech debt report implementation", () => {
  it("uses a maintainable node entrypoint with explicit metric helpers", async () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["tech-debt:report"]).toBe("node ./scripts/tech-debt-report.mjs");
    expect(existsSync(new URL("../scripts/tech-debt-report.mjs", import.meta.url))).toBe(true);

    const reportModule = await import(new URL("../scripts/tech-debt-report.mjs", import.meta.url).href) as {
      collectTechDebtMetrics?: unknown;
      formatTechDebtReport?: unknown;
      reportMetricLabels?: unknown;
    };

    expect(reportModule.collectTechDebtMetrics).toBeTypeOf("function");
    expect(reportModule.formatTechDebtReport).toBeTypeOf("function");
    expect(reportModule.reportMetricLabels).toEqual([
      "Duplication",
      "Dead exports",
      "ts-ignore count",
      "eslint-disable count",
      "TODO/FIXME/HACK count",
      "Dependencies with major updates",
    ]);
  });
});
