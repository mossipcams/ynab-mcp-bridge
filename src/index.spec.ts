import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startHttpServer = vi.fn();
const resolveAppConfig = vi.fn();
const logAuthConfigLoaded = vi.fn();
const logStartupFailure = vi.fn();

vi.mock("./httpTransport.js", () => ({
  startHttpServer,
}));

vi.mock("./config.js", () => ({
  resolveAppConfig,
}));

vi.mock("./startupLogging.js", () => ({
  logAuthConfigLoaded,
  logHttpServerStarted: vi.fn(),
  logStartupFailure,
}));

describe("index startup failure handling", () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.resetModules();
    startHttpServer.mockReset();
    resolveAppConfig.mockReset();
    logAuthConfigLoaded.mockReset();
    logStartupFailure.mockReset();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it("forwards unknown startup failures to startup logging", async () => {
    const { handleStartupFailure } = await import("./index.js");
    const rejection = "boom";

    handleStartupFailure(rejection);

    expect(logStartupFailure).toHaveBeenCalledWith(rejection);
    expect(process.exitCode).toBe(1);
  });

  it("starts the live HTTP server without an auth stack selector", async () => {
    resolveAppConfig.mockReturnValue({
      runtime: {
        allowedOrigins: ["https://claude.ai"],
        auth: { deployment: "authless", mode: "none" },
        host: "127.0.0.1",
        path: "/mcp",
        port: 0,
        transport: "http",
      },
      ynab: {
        apiToken: "test-token",
      },
    });
    startHttpServer.mockResolvedValue({
      close: vi.fn(),
      port: 0,
      url: "http://127.0.0.1:0",
    });

    await import("./index.js");

    expect(startHttpServer).toHaveBeenCalledWith(expect.not.objectContaining({
      authStack: expect.anything(),
    }));
  });

  it("logs the loaded auth2 config summary during startup", async () => {
    resolveAppConfig.mockReturnValue({
      auth2Config: {
        callbackPath: "/oauth/callback",
        clients: [
          {
            clientId: "client-a",
            providerId: "default",
            redirectUri: "https://claude.ai/oauth/callback",
            scopes: ["openid", "profile"],
          },
        ],
        provider: {
          authorizationEndpoint: "https://id.example.com/oauth/authorize",
          clientId: "provider-client-id",
          clientSecret: "provider-client-secret",
          issuer: "https://id.example.com",
          tokenEndpoint: "https://id.example.com/oauth/token",
          usePkce: true,
        },
        accessTokenTtlSec: 3600,
        authCodeTtlSec: 300,
        publicBaseUrl: "https://mcp.example.com",
        refreshTokenTtlSec: 2_592_000,
      },
      runtime: {
        allowedOrigins: ["https://claude.ai"],
        auth: { deployment: "authless", mode: "none" },
        host: "127.0.0.1",
        path: "/mcp",
        port: 0,
        transport: "http",
      },
      ynab: {
        apiToken: "test-token",
      },
    });
    startHttpServer.mockResolvedValue({
      close: vi.fn(),
      port: 0,
      url: "http://127.0.0.1:0",
    });

    await import("./index.js");

    expect(logAuthConfigLoaded).toHaveBeenCalledWith(expect.objectContaining({
      callbackPath: "/oauth/callback",
      clientIds: ["client-a"],
      clientsCount: 1,
      providerAuthorizationHost: "id.example.com",
      providerIssuer: "https://id.example.com",
      usePkce: true,
    }));
  });
});
