import { createServer as createNodeHttpServer } from "node:http";

import { InvalidRequestError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { afterEach, describe, expect, it } from "vitest";

import { createProviderClient } from "./providerClient.js";

describe("createProviderClient", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  async function startProviderServer(options: {
    discoveryDocument?: (origin: string) => Record<string, unknown>;
    discoveryStatus?: number;
    tokenHandler?: (body: URLSearchParams) => {
      body: Record<string, unknown>;
      status?: number;
    };
  } = {}) {
    let lastTokenRequest: URLSearchParams | undefined;
    const server = createNodeHttpServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (requestUrl.pathname === "/jwks") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ keys: [] }));
        return;
      }

      if (requestUrl.pathname === "/.well-known/openid-configuration") {
        const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        res.statusCode = options.discoveryStatus ?? 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(options.discoveryDocument?.(origin) ?? {
          authorization_endpoint: `${origin}/authorize`,
          issuer: origin,
          jwks_uri: `${origin}/jwks`,
          token_endpoint: `${origin}/token`,
        }));
        return;
      }

      if (requestUrl.pathname === "/token" && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
          lastTokenRequest = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
          const response = options.tokenHandler?.(lastTokenRequest) ?? {
            body: {
              access_token: "upstream-access-token",
              expires_in: 3600,
              refresh_token: "upstream-refresh-token",
              scope: "openid profile",
              token_type: "Bearer",
            },
          };
          res.statusCode = response.status ?? 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(response.body));
        });
        return;
      }

      res.statusCode = 404;
      res.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Provider test server did not expose a TCP address.");
    }

    const origin = `http://127.0.0.1:${address.port}`;
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    });

    return {
      authorizationUrl: `${origin}/authorize`,
      getLastTokenRequest: () => lastTokenRequest,
      issuer: origin,
      jwksUrl: `${origin}/jwks`,
      tokenUrl: `${origin}/token`,
    };
  }

  it("builds the upstream authorization URL from explicit provider metadata", () => {
    const providerClient = createProviderClient({
      authorizationUrl: "https://id.example.com/oauth/authorize",
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: "https://id.example.com",
      jwksUrl: "https://id.example.com/.well-known/jwks.json",
      metadataMode: "explicit",
      tokenUrl: "https://id.example.com/oauth/token",
    });
    return expect(providerClient).resolves.toSatisfy((resolvedProviderClient) => {
      const authorizationUrl = resolvedProviderClient.buildAuthorizationUrl({
        resource: "https://mcp.example.com/mcp",
        scopes: ["openid", "profile"],
        upstreamState: "upstream-state-123",
      });

      expect(authorizationUrl.href).toBe(
        "https://id.example.com/oauth/authorize?client_id=oauth-client-id&redirect_uri=https%3A%2F%2Fmcp.example.com%2Foauth%2Fcallback&response_type=code&state=upstream-state-123&scope=openid+profile&resource=https%3A%2F%2Fmcp.example.com%2Fmcp",
      );
      return true;
    });
  });

  it("omits the scope parameter when no scopes are requested", async () => {
    const providerClient = await createProviderClient({
      authorizationUrl: "https://id.example.com/oauth/authorize",
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: "https://id.example.com",
      jwksUrl: "https://id.example.com/.well-known/jwks.json",
      metadataMode: "explicit",
      tokenUrl: "https://id.example.com/oauth/token",
    });

    const authorizationUrl = providerClient.buildAuthorizationUrl({
      resource: "https://mcp.example.com/mcp",
      scopes: [],
      upstreamState: "upstream-state-123",
    });

    expect(authorizationUrl.searchParams.has("scope")).toBe(false);
  });

  it("parses a successful callback response and rejects ambiguous results", async () => {
    const providerClient = await createProviderClient({
      authorizationUrl: "https://id.example.com/oauth/authorize",
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: "https://id.example.com",
      jwksUrl: "https://id.example.com/.well-known/jwks.json",
      metadataMode: "explicit",
      tokenUrl: "https://id.example.com/oauth/token",
    });

    expect(providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?code=abc123&state=upstream-state-123"),
    )).toMatchObject({
      type: "success",
      upstreamState: "upstream-state-123",
    });

    expect(() => providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?code=abc123&error=access_denied&state=upstream-state-123"),
    )).toThrow("Ambiguous upstream OAuth response.");

    expect(() => providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?state=upstream-state-123"),
    )).toThrow("Missing upstream OAuth result.");

    expect(() => providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?code=first&code=second&state=upstream-state-123"),
    )).toThrow("Ambiguous upstream OAuth code.");
  });

  it("parses an error callback response without attempting token exchange", async () => {
    const providerClient = await createProviderClient({
      authorizationUrl: "https://id.example.com/oauth/authorize",
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: "https://id.example.com",
      jwksUrl: "https://id.example.com/.well-known/jwks.json",
      metadataMode: "explicit",
      tokenUrl: "https://id.example.com/oauth/token",
    });

    expect(providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?error=access_denied&error_description=Nope&state=upstream-state-123"),
    )).toEqual({
      error: "access_denied",
      errorDescription: "Nope",
      type: "error",
      upstreamState: "upstream-state-123",
    });
  });

  it("exchanges an authorization code using openid-client and validates state", async () => {
    const provider = await startProviderServer();
    const providerClient = await createProviderClient({
      authorizationUrl: provider.authorizationUrl,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: provider.issuer,
      jwksUrl: provider.jwksUrl,
      metadataMode: "explicit",
      tokenUrl: provider.tokenUrl,
    });

    const response = providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?code=upstream-code-123&state=upstream-state-123"),
    );

    if (response.type !== "success") {
      throw new Error("Expected a successful authorization response.");
    }

    await expect(providerClient.exchangeAuthorizationCodeResponse(response)).resolves.toMatchObject({
      access_token: "upstream-access-token",
      refresh_token: "upstream-refresh-token",
      token_type: "Bearer",
    });

    expect(provider.getLastTokenRequest()?.get("grant_type")).toBe("authorization_code");
    expect(provider.getLastTokenRequest()?.get("code")).toBe("upstream-code-123");
    expect(provider.getLastTokenRequest()?.get("client_id")).toBe("oauth-client-id");
    expect(provider.getLastTokenRequest()?.get("client_secret")).toBe("oauth-client-secret");
    expect(provider.getLastTokenRequest()?.get("redirect_uri")).toBe("https://mcp.example.com/oauth/callback");

    await expect(providerClient.exchangeAuthorizationCodeResponse({
      ...response,
      upstreamState: "wrong-state",
    })).rejects.toThrow(InvalidRequestError);
  });

  it("maps upstream token and refresh failures to closed server errors", async () => {
    const provider = await startProviderServer({
      tokenHandler: (body) => {
        if (body.get("grant_type") === "authorization_code") {
          return {
            body: {
              error: "temporarily_unavailable",
            },
            status: 502,
          };
        }

        return {
          body: {
            error: "invalid_grant",
          },
          status: 400,
        };
      },
    });
    const providerClient = await createProviderClient({
      authorizationUrl: provider.authorizationUrl,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: provider.issuer,
      jwksUrl: provider.jwksUrl,
      metadataMode: "explicit",
      tokenUrl: provider.tokenUrl,
    });

    const response = providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?code=upstream-code-123&state=upstream-state-123"),
    );

    if (response.type !== "success") {
      throw new Error("Expected a successful authorization response.");
    }

    await expect(providerClient.exchangeAuthorizationCodeResponse(response)).rejects.toThrow(ServerError);
    await expect(providerClient.exchangeAuthorizationCodeResponse(response)).rejects.toThrow(
      "Upstream token exchange failed with status 502.",
    );

    await expect(providerClient.exchangeRefreshToken("upstream-refresh-token")).rejects.toThrow(ServerError);
    await expect(providerClient.exchangeRefreshToken("upstream-refresh-token")).rejects.toThrow(
      "Upstream refresh exchange failed with status 400.",
    );
  });

  it("exchanges refresh tokens through the provider token endpoint", async () => {
    const provider = await startProviderServer();
    const providerClient = await createProviderClient({
      authorizationUrl: provider.authorizationUrl,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: provider.issuer,
      jwksUrl: provider.jwksUrl,
      metadataMode: "explicit",
      tokenUrl: provider.tokenUrl,
    });

    await expect(providerClient.exchangeRefreshToken("upstream-refresh-token")).resolves.toMatchObject({
      access_token: "upstream-access-token",
      refresh_token: "upstream-refresh-token",
      token_type: "Bearer",
    });

    expect(provider.getLastTokenRequest()?.get("grant_type")).toBe("refresh_token");
    expect(provider.getLastTokenRequest()?.get("refresh_token")).toBe("upstream-refresh-token");
    expect(provider.getLastTokenRequest()?.get("client_id")).toBe("oauth-client-id");
    expect(provider.getLastTokenRequest()?.get("client_secret")).toBe("oauth-client-secret");
  });

  it("discovers provider metadata from the issuer and uses the discovered endpoints", async () => {
    const provider = await startProviderServer();
    const providerClient = await createProviderClient({
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: provider.issuer,
      metadataMode: "discovery",
    });

    const authorizationUrl = providerClient.buildAuthorizationUrl({
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      upstreamState: "upstream-state-123",
    });

    expect(authorizationUrl.origin).toBe(provider.issuer);
    expect(authorizationUrl.pathname).toBe("/authorize");

    const response = providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?code=upstream-code-123&state=upstream-state-123"),
    );

    if (response.type !== "success") {
      throw new Error("Expected a successful authorization response.");
    }

    await expect(providerClient.exchangeAuthorizationCodeResponse(response)).resolves.toMatchObject({
      access_token: "upstream-access-token",
      refresh_token: "upstream-refresh-token",
      token_type: "Bearer",
    });
    expect(provider.getLastTokenRequest()?.get("code")).toBe("upstream-code-123");
  });

  it("fails closed when discovery metadata is missing required endpoints", async () => {
    const provider = await startProviderServer({
      discoveryDocument: (origin) => ({
        issuer: origin,
      }),
    });

    await expect(createProviderClient({
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      issuer: provider.issuer,
      metadataMode: "discovery",
    })).rejects.toThrow("OAuth discovery metadata is missing required endpoints.");
  });

  it("falls back to explicit metadata when discovery is enabled but fails", async () => {
    const discoveryProvider = await startProviderServer({
      discoveryStatus: 500,
    });
    const explicitProvider = await startProviderServer();
    const providerClient = await createProviderClient({
      authorizationUrl: explicitProvider.authorizationUrl,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      fallbackToExplicit: true,
      issuer: discoveryProvider.issuer,
      jwksUrl: explicitProvider.jwksUrl,
      metadataMode: "discovery",
      tokenUrl: explicitProvider.tokenUrl,
    });

    const authorizationUrl = providerClient.buildAuthorizationUrl({
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      upstreamState: "upstream-state-123",
    });

    expect(authorizationUrl.origin).toBe(new URL(explicitProvider.authorizationUrl).origin);
    expect(authorizationUrl.pathname).toBe("/authorize");

    const response = providerClient.parseAuthorizationResponse(
      new URL("https://mcp.example.com/oauth/callback?code=upstream-code-123&state=upstream-state-123"),
    );

    if (response.type !== "success") {
      throw new Error("Expected a successful authorization response.");
    }

    await expect(providerClient.exchangeAuthorizationCodeResponse(response)).resolves.toMatchObject({
      access_token: "upstream-access-token",
      refresh_token: "upstream-refresh-token",
      token_type: "Bearer",
    });
    expect(explicitProvider.getLastTokenRequest()?.get("code")).toBe("upstream-code-123");
  });

  it("falls back to explicit metadata when discovery returns incomplete metadata", async () => {
    const discoveryProvider = await startProviderServer({
      discoveryDocument: (origin) => ({
        authorization_endpoint: `${origin}/authorize`,
        issuer: origin,
      }),
    });
    const explicitProvider = await startProviderServer();
    const providerClient = await createProviderClient({
      authorizationUrl: explicitProvider.authorizationUrl,
      callbackUrl: "https://mcp.example.com/oauth/callback",
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      fallbackToExplicit: true,
      issuer: discoveryProvider.issuer,
      jwksUrl: explicitProvider.jwksUrl,
      metadataMode: "discovery",
      tokenUrl: explicitProvider.tokenUrl,
    });

    const authorizationUrl = providerClient.buildAuthorizationUrl({
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      upstreamState: "upstream-state-123",
    });

    expect(authorizationUrl.origin).toBe(new URL(explicitProvider.authorizationUrl).origin);
    expect(authorizationUrl.pathname).toBe("/authorize");
  });
});
