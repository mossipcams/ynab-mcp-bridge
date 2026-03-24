import { readFile, writeFile } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { compareReliabilityArtifacts, createReliabilityArtifact, type ReliabilityArtifact } from "./reliabilityArtifact.js";
import { startHttpServer } from "./httpServer.js";
import { getReliabilityProfile, type ReliabilityProfile } from "./reliabilityProfiles.js";
import {
  runReliabilityProbes,
  summarizeReliabilityRun,
  type ReliabilityProbeResult,
  type ReliabilityRunSummary,
} from "./reliabilityRunner.js";
import type { YnabConfig } from "./config.js";

export type ReliabilityHttpOptions = {
  baselineArtifact: string | undefined;
  concurrency: number;
  host: string;
  jsonOut: string | undefined;
  maxErrorRate: number | undefined;
  path: string;
  port: number;
  profileName: "smoke";
  requestCount: number;
  url: string | undefined;
};

export type ReliabilityHttpScenarioOptions = {
  concurrency: number;
  host?: string | undefined;
  maxErrorRate: number;
  path?: string | undefined;
  port?: number | undefined;
  requestCount: number;
  url?: string | undefined;
  ynab: YnabConfig;
};

export type ReliabilityHttpScenarioResult = {
  results: ReliabilityProbeResult[];
  target: {
    mode: "local" | "url";
    url: string;
  };
  summary: ReliabilityRunSummary;
};

type ExecuteReliabilityHttpCliDependencies = {
  runScenario?: (options: ReliabilityHttpScenarioOptions) => Promise<ReliabilityHttpScenarioResult>;
  writeLine?: (line: string) => void;
  ynab?: YnabConfig;
};

type TextContentItem = {
  text: string;
  type: "text";
};

const DEFAULT_OPTIONS: ReliabilityHttpOptions = {
  baselineArtifact: undefined,
  concurrency: 1,
  host: "127.0.0.1",
  jsonOut: undefined,
  maxErrorRate: undefined,
  path: "/mcp",
  port: 0,
  profileName: "smoke",
  requestCount: 5,
  url: undefined,
};

function parseIntegerFlag(name: string, value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected ${name} to be a positive integer.`);
  }

  return parsed;
}

function parsePortFlag(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Expected --port to be zero or a positive integer.");
  }

  return parsed;
}

function parseNumberFlag(name: string, value: string | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Expected ${name} to be a number between 0 and 1.`);
  }

  return parsed;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function measureOperation(operation: string, work: () => Promise<void>): Promise<ReliabilityProbeResult> {
  const startedAt = performance.now();

  try {
    await work();

    return {
      ok: true,
      operation,
      latencyMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      operation,
      latencyMs: performance.now() - startedAt,
      errorMessage: getErrorMessage(error),
    };
  }
}

async function withSilencedConsoleError<T>(work: () => Promise<T>) {
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    return await work();
  } finally {
    console.error = originalConsoleError;
  }
}

async function runSequence(baseUrl: string, index: number) {
  const client = new Client({
    name: `ynab-mcp-bridge-reliability-${index + 1}`,
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
  const results: ReliabilityProbeResult[] = [];
  let connected = false;

  try {
    const initializeResult = await measureOperation("initialize", async () => {
      await client.connect(transport as Parameters<typeof client.connect>[0]);
      connected = true;
    });
    results.push(initializeResult);

    if (!initializeResult.ok) {
      return results;
    }

    results.push(await measureOperation("tools/list", async () => {
      const listedTools = await client.listTools();

      if (!listedTools.tools.some((tool) => tool.name === "ynab_get_mcp_version")) {
        throw new Error("Expected ynab_get_mcp_version to be registered.");
      }
    }));

    results.push(await measureOperation("tools/call:ynab_get_mcp_version", async () => {
      const response = await client.callTool({
        name: "ynab_get_mcp_version",
        arguments: {},
      });
      const content = (
        typeof response === "object" &&
        response !== null &&
        "content" in response &&
        Array.isArray(response.content)
      )
        ? response.content
        : [];
      const versionText = content
        .filter((item): item is TextContentItem => (
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          item.type === "text" &&
          "text" in item &&
          typeof item.text === "string"
        ))
        .map((item) => item.text)
        .join("\n");

      if (!versionText.includes("\"version\"")) {
        throw new Error("Expected ynab_get_mcp_version to return version text.");
      }
    }));

    return results;
  } finally {
    if (connected) {
      await client.close();
    }
  }
}

export function parseReliabilityHttpArgs(argv: string[]): ReliabilityHttpOptions {
  const parsed: ReliabilityHttpOptions = {
    ...DEFAULT_OPTIONS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    switch (argument) {
      case "--requests":
        parsed.requestCount = parseIntegerFlag("--requests", value);
        index += 1;
        break;
      case "--concurrency":
        parsed.concurrency = parseIntegerFlag("--concurrency", value);
        index += 1;
        break;
      case "--max-error-rate":
        parsed.maxErrorRate = parseNumberFlag("--max-error-rate", value);
        index += 1;
        break;
      case "--profile":
        if (value !== "smoke") {
          throw new Error("The HTTP reliability command currently supports only the smoke profile.");
        }
        parsed.profileName = "smoke";
        index += 1;
        break;
      case "--json-out":
        if (!value) {
          throw new Error("Expected --json-out to be followed by a value.");
        }
        parsed.jsonOut = value;
        index += 1;
        break;
      case "--baseline-artifact":
        if (!value) {
          throw new Error("Expected --baseline-artifact to be followed by a value.");
        }
        parsed.baselineArtifact = value;
        index += 1;
        break;
      case "--url":
        if (!value) {
          throw new Error("Expected --url to be followed by a value.");
        }
        parsed.url = value;
        index += 1;
        break;
      case "--host":
        if (!value) {
          throw new Error("Expected --host to be followed by a value.");
        }
        parsed.host = value;
        index += 1;
        break;
      case "--port":
        parsed.port = parsePortFlag(value);
        index += 1;
        break;
      case "--path":
        if (!value) {
          throw new Error("Expected --path to be followed by a value.");
        }
        parsed.path = value;
        index += 1;
        break;
      default:
        throw new Error(`Unknown reliability argument: ${argument}`);
    }
  }

  return parsed;
}

export function formatReliabilitySummary(summary: ReliabilityRunSummary) {
  const status = summary.passed ? "pass" : "fail";
  const lines = [
    [
      `status=${status}`,
      `attempts=${summary.totals.attempts}`,
      `succeeded=${summary.totals.succeeded}`,
      `failed=${summary.totals.failed}`,
      `errorRate=${summary.errorRate.toFixed(4)}`,
      `threshold=${summary.thresholds.maxErrorRate.target.toFixed(4)}`,
      `avg=${summary.latencyMs.average.toFixed(2)}ms`,
      `p50=${summary.latencyMs.p50.toFixed(2)}ms`,
      `p95=${summary.latencyMs.p95.toFixed(2)}ms`,
      `p99=${summary.latencyMs.p99.toFixed(2)}ms`,
    ].join(" "),
  ];

  for (const failure of summary.failures) {
    lines.push(
      `failure operation=${failure.operation} latency=${failure.latencyMs.toFixed(2)}ms message=${failure.errorMessage}`,
    );
  }

  return lines.join("\n");
}

export async function runHttpReliabilityScenario(options: ReliabilityHttpScenarioOptions): Promise<ReliabilityHttpScenarioResult> {
  const executeScenario = async () => {
    const startedServer = options.url
      ? undefined
      : await startHttpServer({
          host: options.host ?? DEFAULT_OPTIONS.host,
          path: options.path ?? DEFAULT_OPTIONS.path,
          port: options.port ?? DEFAULT_OPTIONS.port,
          ynab: options.ynab,
        });
    const baseUrl = options.url ?? startedServer?.url;

    if (!baseUrl) {
      throw new Error("Expected an HTTP URL for the reliability scenario.");
    }

    try {
      const results = await runReliabilityProbes({
        concurrency: options.concurrency,
        count: options.requestCount,
        probe: async (index) => await runSequence(baseUrl, index),
      });

      return {
        results,
        target: {
          mode: options.url ? "url" as const : "local" as const,
          url: baseUrl,
        },
        summary: summarizeReliabilityRun({
          maxErrorRate: options.maxErrorRate,
          maxP95LatencyMs: Number.POSITIVE_INFINITY,
          maxP99LatencyMs: Number.POSITIVE_INFINITY,
          results,
        }),
      };
    } finally {
      await startedServer?.close();
    }
  };

  if (options.url) {
    return await executeScenario();
  }

  return await withSilencedConsoleError(executeScenario);
}

function createSmokeProfile(options: ReliabilityHttpOptions): ReliabilityProfile {
  const baseProfile = getReliabilityProfile("smoke");
  if (baseProfile.runner !== "smoke") {
    throw new Error("Expected the smoke reliability profile.");
  }
  return {
    ...baseProfile,
    smoke: {
      concurrency: options.concurrency,
      requestCount: options.requestCount,
    },
    thresholds: {
      ...baseProfile.thresholds,
      maxErrorRate: options.maxErrorRate ?? baseProfile.thresholds.maxErrorRate,
    },
  };
}

export async function executeReliabilityHttpCli(
  argv: string[],
  dependencies: ExecuteReliabilityHttpCliDependencies = {},
) {
  try {
    const options = parseReliabilityHttpArgs(argv);
    const result = await (dependencies.runScenario ?? runHttpReliabilityScenario)({
      ...options,
      maxErrorRate: options.maxErrorRate ?? getReliabilityProfile("smoke").thresholds.maxErrorRate,
      ynab: dependencies.ynab ?? {
        apiToken: "reliability-test-token",
      },
    });
    const artifact = createReliabilityArtifact({
      completedAt: new Date().toISOString(),
      profile: createSmokeProfile(options),
      results: result.results,
      startedAt: new Date().toISOString(),
      target: result.target,
    });
    const formattedSummary: ReliabilityRunSummary = {
      passed: !artifact.summary.failed,
      maxErrorRate: artifact.profile.thresholds.maxErrorRate,
      errorRate: artifact.summary.thresholds.maxErrorRate.actual,
      failureGroups: artifact.summary.failureGroups,
      totals: artifact.summary.totals,
      latencyMs: artifact.summary.latencyMs,
      thresholds: artifact.summary.thresholds,
      failures: artifact.summary.failures,
    };

    const writeLine = dependencies.writeLine ?? console.log;
    writeLine(formatReliabilitySummary(formattedSummary));

    let exitCode = artifact.summary.failed ? 1 : 0;

    if (options.jsonOut) {
      await writeFile(options.jsonOut, JSON.stringify(artifact, null, 2), "utf8");
      writeLine(`artifact=${options.jsonOut}`);
    }

    if (options.baselineArtifact) {
      let baseline: ReliabilityArtifact;

      try {
        baseline = JSON.parse(await readFile(options.baselineArtifact, "utf8")) as ReliabilityArtifact;
      } catch (error) {
        throw new Error(`Failed to read baseline artifact: ${options.baselineArtifact}. ${getErrorMessage(error)}`);
      }

      const comparison = compareReliabilityArtifacts({
        baseline,
        current: artifact,
        tolerances: {
          maxErrorRateIncrease: 0.05,
          maxP95LatencyIncreaseMs: 250,
          maxP99LatencyIncreaseMs: 250,
        },
      });
      writeLine(`baseline_status=${comparison.passed ? "pass" : "fail"}`);
      if (!comparison.passed) {
        exitCode = 1;
      }
    }

    return exitCode;
  } catch (error) {
    (dependencies.writeLine ?? console.error)(`status=error message=${getErrorMessage(error)}`);
    return 1;
  }
}
