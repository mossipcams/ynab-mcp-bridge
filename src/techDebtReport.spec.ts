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
      countTodoFixmeHackMatches?: unknown;
      collectTechDebtMetrics?: unknown;
      formatTechDebtReport?: unknown;
      isRepoOwnedCodePath?: unknown;
      repoCodeRootRelativeDirectories?: unknown;
      reportMetricLabels?: unknown;
    };

    expect(reportModule.countTodoFixmeHackMatches).toBeTypeOf("function");
    expect(reportModule.collectTechDebtMetrics).toBeTypeOf("function");
    expect(reportModule.formatTechDebtReport).toBeTypeOf("function");
    expect(reportModule.isRepoOwnedCodePath).toBeTypeOf("function");
    expect(reportModule.repoCodeRootRelativeDirectories).toEqual([
      ".github",
      "debugging",
      "scripts",
      "src",
    ]);
    expect(reportModule.reportMetricLabels).toEqual([
      "Duplication",
      "Dead exports",
      "ts-ignore count",
      "eslint-disable count",
      "TODO/FIXME/HACK count",
      "Dependencies with major updates",
    ]);
  });

  it("ignores the tech debt report's self-referential TODO/FIXME/HACK strings", async () => {
    const reportModule = await import(new URL("../scripts/tech-debt-report.mjs", import.meta.url).href) as {
      countTodoFixmeHackMatches?: () => number;
    };

    expect(reportModule.countTodoFixmeHackMatches).toBeTypeOf("function");
    expect(reportModule.countTodoFixmeHackMatches?.()).toBe(0);
  });
});
