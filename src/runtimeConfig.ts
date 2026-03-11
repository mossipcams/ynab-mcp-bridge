export type RuntimeTransport = "http" | "stdio";

export type RuntimeConfig = {
  allowedOrigins: string[];
  host: string;
  path: string;
  port: number;
  transport: RuntimeTransport;
};

type EnvConfig = Record<string, string | undefined>;
type BackendReadiness = {
  checks: {
    ynabApiToken: boolean;
    ynabPlanIdConfigured: boolean;
  };
  planResolution: "configured" | "dynamic";
  status: "ok" | "misconfigured";
};

function readFlag(args: string[], name: string) {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function readCsvFlag(args: string[], name: string) {
  const value = readFlag(args, name);

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getBackendReadiness(env: EnvConfig): BackendReadiness {
  const ynabApiToken = hasValue(env.YNAB_API_TOKEN);
  const ynabPlanIdConfigured = hasValue(env.YNAB_PLAN_ID);

  return {
    status: ynabApiToken ? "ok" : "misconfigured",
    planResolution: ynabPlanIdConfigured ? "configured" : "dynamic",
    checks: {
      ynabApiToken,
      ynabPlanIdConfigured,
    },
  };
}

export function assertBackendEnvironment(env: EnvConfig) {
  const readiness = getBackendReadiness(env);

  if (!readiness.checks.ynabApiToken) {
    throw new Error("YNAB_API_TOKEN is required.");
  }

  return readiness;
}

export function resolveRuntimeConfig(args: string[], env: EnvConfig): RuntimeConfig {
  const rawTransport = readFlag(args, "--transport") ?? env.MCP_TRANSPORT ?? "http";

  if (rawTransport !== "http" && rawTransport !== "stdio") {
    throw new Error(`Unsupported transport: ${rawTransport}`);
  }

  const rawPort = readFlag(args, "--port") ?? env.MCP_PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port)) {
    throw new Error(`Invalid port: ${rawPort}`);
  }

  const allowedOrigins = readCsvFlag(args, "--allowed-origins");
  const envAllowedOrigins = env.MCP_ALLOWED_ORIGINS
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : (envAllowedOrigins ?? []),
    transport: rawTransport,
    host: readFlag(args, "--host") ?? env.MCP_HOST ?? "127.0.0.1",
    path: readFlag(args, "--path") ?? env.MCP_PATH ?? "/mcp",
    port,
  };
}
