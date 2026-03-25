import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("local duplicate-remediation commands", () => {
  it("documents a local duplicate-detection command for whole-codebase duplication", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(packageJson.scripts?.["lint:duplicates"]).toBeDefined();
    expect(packageJson.scripts?.["tech-debt:report"]).toBeDefined();
    expect(readme).toContain("npm run lint:duplicates");
    expect(readme).toContain("npm run tech-debt:report");
    expect(readme).toContain("whole-codebase duplication");
    expect(readme).not.toContain("unexpected production duplication");
  });
});
