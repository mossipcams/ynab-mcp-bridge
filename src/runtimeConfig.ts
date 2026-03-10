export type RuntimeTransport = "http" | "stdio";

export type RuntimeConfig = {
  host: string;
  path: string;
  port: number;
  transport: RuntimeTransport;
};

type EnvConfig = Record<string, string | undefined>;

function readFlag(args: string[], name: string) {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

export function resolveRuntimeConfig(args: string[], env: EnvConfig): RuntimeConfig {
  const rawTransport = readFlag(args, "--transport") ?? env.MCP_TRANSPORT ?? "stdio";

  if (rawTransport !== "http" && rawTransport !== "stdio") {
    throw new Error(`Unsupported transport: ${rawTransport}`);
  }

  const rawPort = readFlag(args, "--port") ?? env.MCP_PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port)) {
    throw new Error(`Invalid port: ${rawPort}`);
  }

  return {
    transport: rawTransport,
    host: readFlag(args, "--host") ?? env.MCP_HOST ?? "0.0.0.0",
    path: readFlag(args, "--path") ?? env.MCP_PATH ?? "/mcp",
    port,
  };
}
