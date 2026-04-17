import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dependency automation", () => {
  it("pins the YNAB SDK to the approved 4.1.x line", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.ynab).toBe("^4.1.0");
  });

  it("defines Dependabot updates for npm and the ynab dependency", () => {
    const config = readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8");

    expect(config).toContain("package-ecosystem: npm");
    expect(config).toContain('directory: "/"');
    expect(config).toContain("schedule:");
    expect(config).toContain("interval: weekly");
    expect(config).toContain("ynab");
  });

  it("keeps the automation scope limited to Dependabot without a canary workflow", () => {
    const hasCanaryWorkflow = existsSync(
      new URL("../.github/workflows/ynab-canary.yml", import.meta.url),
    );

    expect(hasCanaryWorkflow).toBe(false);
  });
});
