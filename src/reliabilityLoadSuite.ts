import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { getReliabilityProfile, parseReliabilityProfileName, type ReliabilityProfile } from "./reliabilityProfiles.js";

export type ReliabilityLoadArgs = {
  dryRun: boolean;
  jsonOut: string | undefined;
  profileName: Exclude<ReturnType<typeof parseReliabilityProfileName>, "smoke">;
  targetUrl: string;
};

export type ReliabilityLoadSuitePlan = {
  command: string[];
  jsonOut: string | undefined;
  profile: ReliabilityProfile;
  targetUrl: string;
};

type ExecuteReliabilityLoadCliDependencies = {
  runExternal?: (plan: ReliabilityLoadSuitePlan) => Promise<number>;
  writeLine?: (line: string) => void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function requireFlagValue(flag: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Expected ${flag} to be followed by a value.`);
  }

  return value;
}

function applyLoadFlag(
  parsed: ReliabilityLoadArgs,
  argument: string,
  value: string | undefined,
) {
  if (argument === "--dry-run") {
    parsed.dryRun = true;
    return false;
  }

  const requiredValue = requireFlagValue(argument, value);

  if (argument === "--profile") {
    const profileName = parseReliabilityProfileName(requiredValue);
    if (profileName === "smoke") {
      throw new Error("The dedicated load suite only supports baseline, stress, spike, and soak.");
    }
    parsed.profileName = profileName;
    return true;
  }

  if (argument === "--url") {
    parsed.targetUrl = requiredValue;
    return true;
  }

  if (argument === "--json-out") {
    parsed.jsonOut = requiredValue;
    return true;
  }

  throw new Error(`Unknown reliability load argument: ${argument}`);
}

export function parseReliabilityLoadArgs(argv: string[]): ReliabilityLoadArgs {
  const parsed: ReliabilityLoadArgs = {
    dryRun: false,
    jsonOut: undefined,
    profileName: "baseline",
    targetUrl: "http://127.0.0.1:3000/mcp",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) {
      continue;
    }
    const value = argv[index + 1];
    if (applyLoadFlag(parsed, argument, value)) {
      index += 1;
    }
  }

  return parsed;
}

export function buildLoadSuitePlan(args: ReliabilityLoadArgs): ReliabilityLoadSuitePlan {
  const profile = getReliabilityProfile(args.profileName);

  if (profile.runner !== "load") {
    throw new Error(`Profile ${profile.name} is not a load-suite profile.`);
  }

  return {
    command: args.jsonOut
      ? ["k6", "run", "--summary-export", args.jsonOut]
      : ["k6", "run"],
    jsonOut: args.jsonOut,
    profile,
    targetUrl: args.targetUrl,
  };
}

export function renderK6Script(plan: ReliabilityLoadSuitePlan) {
  if (plan.profile.runner !== "load") {
    throw new Error("Expected a load profile when rendering the k6 script.");
  }

  return `import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    ${plan.profile.name}: {
      executor: "ramping-vus",
      startVUs: 0,
      gracefulStop: "0s",
      stages: [
        { duration: "${plan.profile.load.warmupSeconds}s", target: ${plan.profile.load.targetVus} },
        { duration: "${plan.profile.load.durationSeconds}s", target: ${plan.profile.load.targetVus} },
      ],
    },
  },
  thresholds: {
    http_req_failed: [
      "rate<=${plan.profile.thresholds.maxErrorRate}",
    ],
    http_req_duration: [
      "p(95)<=${plan.profile.thresholds.maxP95LatencyMs}",
      "p(99)<=${plan.profile.thresholds.maxP99LatencyMs}",
    ],
  },
};

const TARGET_URL = __ENV.TARGET_URL;
const MCP_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json, text/event-stream",
  "MCP-Protocol-Version": "2025-11-25",
};

function rpc(method, params, id) {
  const response = http.post(TARGET_URL, JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params,
  }), {
    headers: MCP_HEADERS,
  });

  check(response, {
    "status is 200": (result) => result.status === 200,
  });

  return response;
}

export default function () {
  rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: {
      name: "k6-reliability-suite",
      version: "1.0.0",
    },
  }, 1);

  rpc("tools/list", {}, 2);

  rpc("tools/call", {
    name: "ynab_get_mcp_version",
    arguments: {},
  }, 3);

  sleep(1);
}
`;
}

async function defaultRunExternal(plan: ReliabilityLoadSuitePlan) {
  const scriptDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-k6-"));
  const scriptPath = path.join(scriptDir, `${plan.profile.name}.js`);
  await writeFile(scriptPath, renderK6Script(plan), "utf8");

  const { spawn } = await import("node:child_process");

  return await new Promise<number>((resolve, reject) => {
    const command = spawn(plan.command[0]!, [...plan.command.slice(1), scriptPath], {
      env: {
        ...process.env,
        TARGET_URL: plan.targetUrl,
      },
      stdio: "inherit",
    });

    command.on("error", reject);
    command.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

export async function executeReliabilityLoadCli(
  argv: string[],
  dependencies: ExecuteReliabilityLoadCliDependencies = {},
) {
  try {
    const parsed = parseReliabilityLoadArgs(argv);
    const plan = buildLoadSuitePlan(parsed);

    if (parsed.dryRun) {
      (dependencies.writeLine ?? console.log)(JSON.stringify({
        command: plan.command,
        jsonOut: plan.jsonOut,
        profile: plan.profile.name,
        targetUrl: plan.targetUrl,
        thresholds: plan.profile.thresholds,
      }));
      return 0;
    }

    const exitCode = await (dependencies.runExternal ?? defaultRunExternal)(plan);
    return exitCode === 0 ? 0 : 1;
  } catch (error) {
    (dependencies.writeLine ?? console.error)(`status=error message=${getErrorMessage(error)}`);
    return 1;
  }
}
