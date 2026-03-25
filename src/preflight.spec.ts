import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("local preflight command", () => {
  it("defines a documented preflight script aligned with the required CI gates", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const preflightScript = packageJson.scripts?.["preflight"];

    expect(preflightScript).toBeDefined();
    expect(preflightScript).toContain("npm run test:ci");
    expect(preflightScript).toContain("npm run test:coverage");
    expect(preflightScript).toContain("npm run lint:deps");
    expect(preflightScript).toContain("npm run lint");
    expect(preflightScript).toContain("npm run typecheck");
    expect(preflightScript).toContain("npm run lint:unused");
    expect(preflightScript).toContain("npm run build");
    expect(readme).toContain("npm run preflight");
  });

  it("documents the advisory duplicate-detection and tech debt report commands separately", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const preflightScript = packageJson.scripts?.["preflight"];

    expect(packageJson.scripts?.["lint:duplicates"]).toContain(".jscpd.json");
    expect(packageJson.scripts?.["tech-debt:report"]).toContain("scripts/tech-debt-report.mjs");
    expect(readme).toContain("npm run lint:duplicates");
    expect(readme).toContain("npm run tech-debt:report");
    expect(readme).toContain("advisory");
    expect(preflightScript).not.toContain("lint:duplicates");
    expect(preflightScript).not.toContain("tech-debt:report");
  });
});
