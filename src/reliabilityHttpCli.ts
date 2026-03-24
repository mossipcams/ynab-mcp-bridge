#!/usr/bin/env node

import { spawn } from "node:child_process";

import { executeReliabilityHttpCli, parseReliabilityHttpArgs } from "./reliabilityHttp.js";

type StartedLocalBridge = {
  close: () => Promise<void>;
  url: string;
};

async function waitForLocalBridge(url: string, timeoutMs = 5_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: "GET",
      });

      if (response.status === 405) {
        return;
      }
    } catch {
      // Keep polling until the child process finishes booting or times out.
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(`Timed out waiting for local reliability target at ${url}.`);
}

async function startLocalBridge(argv: string[]): Promise<StartedLocalBridge> {
  const options = parseReliabilityHttpArgs(argv);
  const port = options.port === 0 ? 3000 : options.port;
  const url = `http://${options.host}:${port}${options.path}`;
  const child = spawn(
    process.execPath,
    [new URL("./index.js", import.meta.url).pathname, "--transport", "http"],
    {
      env: {
        ...process.env,
        MCP_HOST: options.host,
        MCP_PATH: options.path,
        MCP_PORT: String(port),
        YNAB_API_TOKEN:
          process.env["YNAB_API_TOKEN"] ?? "reliability-test-token",
      },
      stdio: "ignore",
    },
  );

  try {
    await waitForLocalBridge(url);
  } catch (error) {
    child.kill();
    throw error;
  }

  return {
    close: async () => {
      child.kill();
      await new Promise<void>((resolve) => {
        child.once("exit", () => {
          resolve();
        });
      });
    },
    url,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseReliabilityHttpArgs(argv);
  const startedBridge = options.url
    ? undefined
    : await startLocalBridge(argv);

  try {
    process.exitCode = await executeReliabilityHttpCli(
      startedBridge
        ? [...argv, "--url", startedBridge.url]
        : argv,
    );
  } finally {
    await startedBridge?.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
