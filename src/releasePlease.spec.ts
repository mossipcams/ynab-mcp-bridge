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

  function getVersionSection(changelog: string, version: string) {
    const marker = `## [${version}]`;
    const start = changelog.indexOf(marker);

    if (start === -1) {
      throw new Error(`Expected changelog section for ${version}.`);
    }

    const nextSection = changelog.indexOf("\n## [", start + marker.length);
    return changelog.slice(start, nextSection === -1 ? undefined : nextSection);
  }

  it("defines a release-please workflow", () => {
    const workflow = readFileSync(new URL("../.github/workflows/release-please.yml", import.meta.url), "utf8");

    expect(workflow).toContain("googleapis/release-please-action@v4");
    expect(workflow).toContain("config-file: .release-please-config.json");
    expect(workflow).toContain("manifest-file: .release-please-manifest.json");
  });

  it("dispatches release PR validations from release-please outputs without local git state", () => {
    const workflow = readFileSync(new URL("../.github/workflows/release-please.yml", import.meta.url), "utf8");

    expect(workflow).toContain("id: release");
    expect(workflow).toContain("steps.release.outputs.prs_created");
    expect(workflow).not.toContain("gh pr list");
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

  it("keeps release metadata ahead of published tags without rollback pins", () => {
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
    if (!highestPublishedTagVersion) {
      throw new Error("Expected at least one published release tag.");
    }
    expect(compareVersions(packageJson.version, highestPublishedTagVersion)).toBeGreaterThanOrEqual(0);
    expect(manifest["."]).toBe(packageJson.version);
    expect(config).not.toHaveProperty("last-release-sha");
  });

  it("fetches repository tags in CI before enforcing release metadata invariants", () => {
    const workflow = readFileSync(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");

    expect(workflow).toContain("uses: actions/checkout@v4");
    expect(workflow).toContain("fetch-depth: 0");
  });

  it("keeps the 0.8.0 changelog entry aligned with the cleaned release notes", () => {
    const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
    const releaseSection = getVersionSection(changelog, "0.8.0");

    expect(releaseSection).toContain("add client-aware oauth setup profiles");
    expect(releaseSection).toContain("restore release-please baseline");
    expect(releaseSection).not.toContain("restore v0.6.0 release");
    expect(releaseSection).not.toContain("restore v0.6.5 release");
    expect(releaseSection).not.toContain("### Reverts");
  });
});
