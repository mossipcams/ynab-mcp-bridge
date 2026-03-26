import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { startHttpServer } from "./httpTransport.js";
import type { ReliabilityRunSummary } from "./reliabilityRunner.js";
import {
  executeReliabilityHttpCli,
  formatReliabilitySummary,
  parseReliabilityHttpArgs,
  runHttpReliabilityScenario,
} from "./reliabilityHttp.js";

describe("reliability http", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("parses CLI args with safe defaults and explicit overrides", () => {
    expect(parseReliabilityHttpArgs([])).toEqual({
      concurrency: 1,
      host: "127.0.0.1",
      jsonOut: undefined,
      maxErrorRate: undefined,
      profileName: "smoke",
      path: "/mcp",
      port: 0,
      requestCount: 5,
      url: undefined,
      baselineArtifact: undefined,
    });

    expect(parseReliabilityHttpArgs([
      "--profile",
      "smoke",
      "--requests",
      "4",
      "--concurrency",
      "2",
      "--max-error-rate",
      "0.25",
      "--json-out",
      "artifacts/reliability/smoke.json",
      "--url",
      "http://127.0.0.1:4100/mcp",
    ])).toEqual({
      concurrency: 2,
      host: "127.0.0.1",
      jsonOut: "artifacts/reliability/smoke.json",
      maxErrorRate: 0.25,
      profileName: "smoke",
      path: "/mcp",
      port: 0,
      requestCount: 4,
      url: "http://127.0.0.1:4100/mcp",
      baselineArtifact: undefined,
    });
  });

  it("accepts an explicit ephemeral port and surfaces actionable baseline artifact read errors", async () => {
    expect(parseReliabilityHttpArgs([
      "--port",
      "0",
    ])).toMatchObject({
      port: 0,
    });

    const lines: string[] = [];
    const exitCode = await executeReliabilityHttpCli([
      "--baseline-artifact",
      "/tmp/does-not-exist-reliability-baseline.json",
    ], {
      runScenario: vi.fn().mockResolvedValue({
        results: [],
        target: {
          mode: "local",
          url: "http://127.0.0.1:3000/mcp",
        },
        summary: {
          passed: true,
          maxErrorRate: 0,
          errorRate: 0,
          failureGroups: [],
          totals: {
            attempts: 0,
            failed: 0,
            succeeded: 0,
          },
          latencyMs: {
            min: 0,
            max: 0,
            average: 0,
            p50: 0,
            p95: 0,
            p99: 0,
          },
          thresholds: {
            maxErrorRate: { actual: 0, passed: true, target: 0 },
            maxP95LatencyMs: { actual: 0, passed: true, target: 250 },
            maxP99LatencyMs: { actual: 0, passed: true, target: 500 },
          },
          failures: [],
        },
      }),
      writeLine: (line) => {
        lines.push(line);
      },
    });

    expect(exitCode).toBe(1);
    expect(lines.join("\n")).toContain("Failed to read baseline artifact");
    expect(lines.join("\n")).toContain("/tmp/does-not-exist-reliability-baseline.json");
  });

  it("runs initialize, tools/list, and ynab_get_mcp_version against a local authless HTTP server", async () => {
    const httpServer = await startHttpServer({
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab: {
        apiToken: "test-token",
      },
    });
    cleanups.push(async () => {
      await httpServer.close();
    });

    const result = await runHttpReliabilityScenario({
      concurrency: 1,
      maxErrorRate: 0,
      requestCount: 2,
      url: httpServer.url,
      ynab: {
        apiToken: "test-token",
      },
    });

    expect(result.summary.passed).toBe(true);
    expect(result.summary.totals).toEqual({
      attempts: 6,
      failed: 0,
      succeeded: 6,
    });
    expect(result.summary.failures).toEqual([]);
    expect(result.results.map((entry) => entry.operation)).toEqual([
      "initialize",
      "tools/list",
      "tools/call:ynab_get_mcp_version",
      "initialize",
      "tools/list",
      "tools/call:ynab_get_mcp_version",
    ]);
  });

  it("formats a compact reliability summary and returns a failing exit code when the threshold is breached", async () => {
    const summary: ReliabilityRunSummary = {
      passed: false,
      maxErrorRate: 0.1,
      errorRate: 0.5,
      totals: {
        attempts: 6,
        succeeded: 3,
        failed: 3,
      },
      latencyMs: {
        min: 4,
        max: 20,
        average: 10,
        p50: 10,
        p95: 20,
        p99: 20,
      },
      thresholds: {
        maxErrorRate: { actual: 0.5, passed: false, target: 0.1 },
        maxP95LatencyMs: { actual: 20, passed: true, target: 500 },
        maxP99LatencyMs: { actual: 20, passed: true, target: 1000 },
      },
      failureGroups: [
        {
          count: 1,
          operation: "tools/list",
          sampleMessages: ["Unexpected status 500"],
        },
      ],
      failures: [
        {
          operation: "tools/list",
          latencyMs: 20,
          errorMessage: "Unexpected status 500",
        },
      ],
    };

    expect(formatReliabilitySummary(summary)).toContain("attempts=6");
    expect(formatReliabilitySummary(summary)).toContain("failed=3");
    expect(formatReliabilitySummary(summary)).toContain("p95=20.00ms");

    const lines: string[] = [];
    const exitCode = await executeReliabilityHttpCli(["--requests", "2"], {
      runScenario: vi.fn().mockResolvedValue({
        results: [
          {
            ok: false,
            operation: "tools/list",
            latencyMs: 20,
            errorMessage: "Unexpected status 500",
          },
        ],
        target: {
          mode: "url",
          url: "http://127.0.0.1:4100/mcp",
        },
        summary,
      }),
      writeLine: (line) => {
        lines.push(line);
      },
    });

    expect(exitCode).toBe(1);
    expect(lines.join("\n")).toContain("status=fail");
    expect(lines.join("\n")).toContain("Unexpected status 500");
  });

  it("writes a JSON artifact and compares a run against a baseline artifact", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-reliability-"));
    const artifactPath = path.join(tempDir, "current.json");
    const baselinePath = path.join(tempDir, "baseline.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    await writeFile(baselinePath, JSON.stringify({
      completedAt: "2026-03-24T11:05:00.000Z",
      profile: {
        description: "Fast local HTTP smoke probe for regressions.",
        name: "smoke",
        runner: "smoke",
        smoke: {
          concurrency: 1,
          requestCount: 2,
        },
        thresholds: {
          abortOnFail: false,
          maxErrorRate: 0,
          maxP95LatencyMs: 250,
          maxP99LatencyMs: 500,
        },
      },
      startedAt: "2026-03-24T11:00:00.000Z",
      summary: {
        failed: false,
        failureGroups: [],
        failures: [],
        latencyMs: {
          average: 125,
          max: 200,
          min: 90,
          p50: 120,
          p95: 200,
          p99: 200,
        },
        thresholds: {
          maxErrorRate: { actual: 0, passed: true, target: 0.01 },
          maxP95LatencyMs: { actual: 200, passed: true, target: 500 },
          maxP99LatencyMs: { actual: 200, passed: true, target: 1000 },
        },
        totals: {
          attempts: 4,
          failed: 0,
          succeeded: 4,
        },
      },
      target: {
        mode: "local",
        url: "http://127.0.0.1:3000/mcp",
      },
    }, null, 2));

    const lines: string[] = [];
    const exitCode = await executeReliabilityHttpCli([
      "--requests",
      "2",
      "--json-out",
      artifactPath,
      "--baseline-artifact",
      baselinePath,
    ], {
      runScenario: vi.fn().mockResolvedValue({
        results: [
          { ok: true, operation: "initialize", latencyMs: 150 },
          { ok: false, operation: "tools/list", latencyMs: 700, errorMessage: "Unexpected status 500" },
          { ok: true, operation: "tools/call:ynab_get_mcp_version", latencyMs: 800 },
        ],
        target: {
          mode: "local",
          url: "http://127.0.0.1:3000/mcp",
        },
        summary: {
          errorRate: 1 / 3,
          failures: [
            {
              errorMessage: "Unexpected status 500",
              latencyMs: 700,
              operation: "tools/list",
            },
          ],
          latencyMs: {
            average: 550,
            max: 800,
            min: 150,
            p50: 700,
            p95: 800,
            p99: 800,
          },
          passed: false,
          thresholds: {
            maxErrorRate: { actual: 1 / 3, passed: false, target: 0 },
            maxP95LatencyMs: { actual: 800, passed: false, target: 250 },
            maxP99LatencyMs: { actual: 800, passed: false, target: 500 },
          },
          totals: {
            attempts: 3,
            failed: 1,
            succeeded: 2,
          },
          failureGroups: [
            {
              count: 1,
              operation: "tools/list",
              sampleMessages: ["Unexpected status 500"],
            },
          ],
        },
      }),
      writeLine: (line) => {
        lines.push(line);
      },
    });

    expect(exitCode).toBe(1);
    expect(lines.join("\n")).toContain("baseline_status=fail");
    expect(await readFile(artifactPath, "utf8")).toContain("\"failureGroups\"");
  });
});
