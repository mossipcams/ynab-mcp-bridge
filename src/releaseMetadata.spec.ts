import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("release metadata rollback target", () => {
  it("pins the package and release manifest to the current 0.7.2 baseline", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    const releaseManifest = JSON.parse(
      await readFile(new URL("../.release-please-manifest.json", import.meta.url), "utf8"),
    ) as Record<string, string>;
    const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");

    expect(packageJson.version).toBe("0.7.2");
    expect(releaseManifest["."]).toBe("0.7.2");
    expect(changelog).toContain("## [0.7.2]");
    expect(changelog).toContain("## [0.6.5]");
  });
});
