import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("local preflight command", () => {
  it("defines a dedicated PR-local-CI script and documents it as the pre-PR command", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const localCiScript = readFileSync(
      new URL("../scripts/local-ci.mjs", import.meta.url),
      "utf8",
    );
    const preflightScript = packageJson.scripts?.["preflight"];
    const prCiScript = packageJson.scripts?.["pr:ci"];

    expect(preflightScript).toBeDefined();
    expect(prCiScript).toBe("node ./scripts/local-ci.mjs");
    expect(preflightScript).toBe("npm run pr:ci");
    expect(localCiScript).toContain('"npm", ["run", "test:ci"]');
    expect(localCiScript).toContain('"npm", ["run", "test:coverage"]');
    expect(localCiScript).toContain('"npm", ["run", "lint:deps"]');
    expect(localCiScript).toContain('"npm", ["run", "lint"]');
    expect(localCiScript).toContain('"npm", ["run", "typecheck"]');
    expect(localCiScript).toContain('"npm", ["run", "lint:unused"]');
    expect(localCiScript).toContain('"npm", ["run", "build"]');
    expect(readme).toContain("npm run pr:ci");
    expect(readme).toContain("before creating a PR");
    expect(readme).toContain("instead of running individual test commands");
    expect(readme).toContain("verify:build-sync");
    expect(readme).toContain("verify:pack");
    expect(readme).toContain("restart");
  });

  it("prints the CI step order in dry-run mode", () => {
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(new URL("../scripts/local-ci.mjs", import.meta.url)), "--dry-run"],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
      },
    );

    expect(output).toContain("1. npm run test:ci");
    expect(output).toContain("2. npm run test:coverage");
    expect(output).toContain("3. npm run lint:deps");
    expect(output).toContain("4. npm run lint");
    expect(output).toContain("5. npm run typecheck");
    expect(output).toContain("6. npm run lint:unused");
    expect(output).toContain("7. npm run build");
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
    expect(readme).toContain("maintained production, tooling, and configuration files");
    expect(readme).toContain("auth2 harness");
    expect(readme).toContain("advisory");
    expect(preflightScript).not.toContain("lint:duplicates");
    expect(preflightScript).not.toContain("tech-debt:report");
  });
});
