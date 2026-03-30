import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("mutation tooling", () => {
  it("defines a scoped Stryker mutation test command and config for the collection/query slice", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.["test:mutation"]).toBe("stryker run");
    expect(packageJson.devDependencies?.["@stryker-mutator/core"]).toBeTruthy();
    expect(packageJson.devDependencies?.["@stryker-mutator/vitest-runner"]).toBeTruthy();

    const strykerConfig = JSON.parse(
      readFileSync(new URL("../stryker.config.json", import.meta.url), "utf8"),
    ) as {
      testRunner?: string;
      plugins?: string[];
      mutate?: string[];
      vitest?: {
        configFile?: string;
        related?: boolean;
      };
    };

    expect(strykerConfig.testRunner).toBe("vitest");
    expect(strykerConfig.plugins).toContain("@stryker-mutator/vitest-runner");
    expect(strykerConfig.mutate).toEqual([
      "src/tools/collectionToolUtils.ts",
      "src/transactionQueryEngine.ts",
    ]);
    expect(strykerConfig.vitest).toEqual({
      configFile: "vitest.mutation.config.ts",
      related: true,
    });
  });
});
