import { describe, expect, it, vi } from "vitest";

import {
  buildLoadSuitePlan,
  executeReliabilityLoadCli,
  parseReliabilityLoadArgs,
  renderK6Script,
} from "./reliabilityLoadSuite.js";

describe("reliability load suite", () => {
  it("parses dedicated load-suite args with profile selection and output controls", () => {
    expect(parseReliabilityLoadArgs([
      "--profile",
      "spike",
      "--url",
      "http://127.0.0.1:3000/mcp",
      "--json-out",
      "artifacts/reliability/spike.json",
      "--dry-run",
    ])).toEqual({
      dryRun: true,
      jsonOut: "artifacts/reliability/spike.json",
      profileName: "spike",
      targetUrl: "http://127.0.0.1:3000/mcp",
    });
  });

  it("rejects value flags when the next token is another flag instead of a value", () => {
    expect(() => parseReliabilityLoadArgs([
      "--url",
      "--dry-run",
    ])).toThrow("Expected --url to be followed by a value.");
  });

  it("builds a dedicated load-suite plan from the selected profile", () => {
    const plan = buildLoadSuitePlan({
      dryRun: false,
      jsonOut: "artifacts/reliability/baseline.json",
      profileName: "baseline",
      targetUrl: "http://127.0.0.1:3000/mcp",
    });

    expect(plan.profile.name).toBe("baseline");
    expect(plan.targetUrl).toBe("http://127.0.0.1:3000/mcp");
    expect(plan.jsonOut).toBe("artifacts/reliability/baseline.json");
    expect(plan.command).toEqual([
      "k6",
      "run",
      "--summary-export",
      "artifacts/reliability/baseline.json",
    ]);
    expect(renderK6Script(plan)).toContain("export const options =");
    expect(renderK6Script(plan)).toContain("http.post");
    expect(renderK6Script(plan)).toContain("TARGET_URL");
    expect(renderK6Script(plan)).toContain("tools/call");
    expect(renderK6Script(plan)).toContain("stages");
    expect(renderK6Script(plan)).toContain("10s");
  });

  it("renders a ramping-vus script without arrival-rate-only fields", () => {
    const plan = buildLoadSuitePlan({
      dryRun: false,
      jsonOut: undefined,
      profileName: "baseline",
      targetUrl: "http://127.0.0.1:3000/mcp",
    });

    const script = renderK6Script(plan);

    expect(script).toContain('executor: "ramping-vus"');
    expect(script).not.toContain("preAllocatedVUs");
    expect(script).not.toContain("maxVUs");
  });

  it("supports a dry-run interface and returns a failing exit code when the external runner fails", async () => {
    const lines: string[] = [];

    const dryRunExitCode = await executeReliabilityLoadCli([
      "--profile",
      "baseline",
      "--url",
      "http://127.0.0.1:3000/mcp",
      "--dry-run",
    ], {
      writeLine: (line) => {
        lines.push(line);
      },
    });

    expect(dryRunExitCode).toBe(0);
    expect(lines.join("\n")).toContain("\"profile\":\"baseline\"");

    const runExternal = vi.fn().mockResolvedValue(17);
    const failingExitCode = await executeReliabilityLoadCli([
      "--profile",
      "stress",
      "--url",
      "http://127.0.0.1:3000/mcp",
    ], {
      runExternal,
      writeLine: () => {},
    });

    expect(failingExitCode).toBe(1);
    expect(runExternal).toHaveBeenCalledOnce();
  });

  it("reports invalid load-suite flags through the CLI error surface", async () => {
    const lines: string[] = [];

    const exitCode = await executeReliabilityLoadCli([
      "--profile",
      "smoke",
    ], {
      writeLine: (line) => {
        lines.push(line);
      },
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "status=error message=The dedicated load suite only supports baseline, stress, spike, and soak.",
    ]);
  });

  it("returns a failing exit code when the external runner rejects", async () => {
    const lines: string[] = [];

    const exitCode = await executeReliabilityLoadCli([
      "--profile",
      "baseline",
    ], {
      runExternal: vi.fn().mockRejectedValue(new Error("k6 missing")),
      writeLine: (line) => {
        lines.push(line);
      },
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "status=error message=k6 missing",
    ]);
  });
});
