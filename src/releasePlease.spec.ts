import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { getPackageVersion } from "./packageInfo.js";

describe("release-please automation", () => {
  function parseVersion(version: string) {
    return version.split(".").map((part) => Number.parseInt(part, 10));
  }

  function compareVersions(left: string, right: string) {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);

    for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
      const leftPart = leftParts[index] ?? 0;
      const rightPart = rightParts[index] ?? 0;

      if (leftPart !== rightPart) {
        return leftPart - rightPart;
      }
    }

    return 0;
  }

  function getHighestPublishedTagVersion() {
    const tags = execFileSync(
      "git",
      ["tag", "--list", "ynab-mcp-bridge-v*"],
      { cwd: new URL("..", import.meta.url), encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((tag) => tag.replace("ynab-mcp-bridge-v", ""));

    if (tags.length === 0) {
      throw new Error("Expected at least one ynab-mcp-bridge release tag.");
    }

    return tags.sort(compareVersions).at(-1);
  }

  it("defines a release-please workflow", () => {
    const workflow = readFileSync(new URL("../.github/workflows/release-please.yml", import.meta.url), "utf8");

    expect(workflow).toContain("googleapis/release-please-action@v4");
    expect(workflow).toContain("config-file: .release-please-config.json");
    expect(workflow).toContain("manifest-file: .release-please-manifest.json");
  });

  it("defines a PR title validation workflow for releasable conventional commits", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/validate-pr-title.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("pull_request_target");
    expect(workflow).toContain("PR title must use a releasable Conventional Commit title");
    expect(workflow).toContain("feat|fix|deps|revert");
  });

  it("documents squash merge and releasable PR titles for release automation", () => {
    const instructions = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");

    expect(instructions).toContain("Use squash merge");
    expect(instructions).toContain("The PR title must be a releasable Conventional Commit");
  });

  it("tracks the current package version in the release manifest", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const config = JSON.parse(
      readFileSync(new URL("../.release-please-config.json", import.meta.url), "utf8"),
    );
    const manifest = JSON.parse(
      readFileSync(new URL("../.release-please-manifest.json", import.meta.url), "utf8"),
    );

    expect(config.packages["."]).toMatchObject({
      "package-name": "ynab-mcp-bridge",
      "release-type": "node",
    });
    expect(manifest["."]).toBe(getPackageVersion());
    expect(packageJson.author).not.toContain("Caleb");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "git+https://github.com/mossipcams/ynab-mcp-bridge.git",
    });
    expect(packageJson.homepage).toBe("https://github.com/mossipcams/ynab-mcp-bridge#readme");
    expect(packageJson.bugs).toEqual({
      url: "https://github.com/mossipcams/ynab-mcp-bridge/issues",
    });
  });

  it("keeps release metadata aligned with the highest published tag and avoids rollback pins", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const config = JSON.parse(
      readFileSync(new URL("../.release-please-config.json", import.meta.url), "utf8"),
    );
    const manifest = JSON.parse(
      readFileSync(new URL("../.release-please-manifest.json", import.meta.url), "utf8"),
    );
    const highestPublishedTagVersion = getHighestPublishedTagVersion();

    expect(highestPublishedTagVersion).toBeDefined();
    expect(packageJson.version).toBe(highestPublishedTagVersion);
    expect(manifest["."]).toBe(highestPublishedTagVersion);
    expect(config).not.toHaveProperty("last-release-sha");
  });
});
