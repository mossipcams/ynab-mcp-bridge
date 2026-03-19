import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dependency automation", () => {
  it("defines Dependabot updates for npm and the ynab dependency", () => {
    const config = readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8");

    expect(config).toContain("package-ecosystem: npm");
    expect(config).toContain('directory: "/"');
    expect(config).toContain("schedule:");
    expect(config).toContain("interval: weekly");
    expect(config).toContain("ynab");
  });

  it("defines a scheduled canary workflow that validates against ynab@latest", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ynab-canary.yml", import.meta.url), "utf8");

    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("cron:");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm install --no-save ynab@latest");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
  });

  it("creates a GitHub issue with triage details when the ynab canary fails", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ynab-canary.yml", import.meta.url), "utf8");

    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("actions/github-script@v7");
    expect(workflow).toContain("deps: ynab canary failed");
    expect(workflow).toContain("YNAB version");
    expect(workflow).toContain("Run URL");
  });
});
