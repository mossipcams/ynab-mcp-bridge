import { afterEach, describe, expect, it } from "vitest";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { startHttpServer } from "../../httpTransport.js";
import {
  createAuth2Config,
  createCloudflareOAuthAuth,
  createCodeChallenge,
  readJsonResponse,
  startUpstreamOAuthServer,
} from "../../oauthTestHelpers.js";

describe("auth2 payload metrics", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const ynab = {
    apiToken: "test-token",
  } as const;

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  async function issueAuthorizationCode(serverUrl: string) {
    const verifier = "client-a-verifier";
    const authorize = await fetch(new URL(
      `/authorize?client_id=client-a&redirect_uri=${encodeURIComponent("https://claude.ai/oauth/callback")}&response_type=code&code_challenge=${encodeURIComponent(createCodeChallenge(verifier))}&code_challenge_method=S256&scope=${encodeURIComponent("openid profile")}&state=client-state-123`,
      serverUrl,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });
    const upstreamState = new URL(authorize.headers.get("location")!).searchParams.get("state");
    const callback = await fetch(new URL(
      `/oauth/callback?code=upstream-code-123&state=${encodeURIComponent(upstreamState!)}`,
      serverUrl,
    ), {
      headers: {
        Origin: "https://claude.ai",
      },
      redirect: "manual",
    });

    return {
      code: new URL(callback.headers.get("location")!).searchParams.get("code"),
      verifier,
    };
  }

  it("captures current auth2 OAuth payload sizes and response shapes", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: createAuth2Config(upstream),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

    const oauthMetadata = await readJsonResponse(await fetch(new URL("/.well-known/oauth-authorization-server", server.url)));
    const protectedResource = await readJsonResponse(await fetch(new URL("/.well-known/oauth-protected-resource/mcp", server.url)));

    const registration = await readJsonResponse(await fetch(new URL("/register", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
      },
      body: JSON.stringify({
        client_name: "Claude",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    }));

    const issued = await issueAuthorizationCode(server.url);
    const tokenSuccess = await readJsonResponse(await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: "client-a",
        code: issued.code ?? "",
        code_verifier: issued.verifier,
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
      }),
    }));

    const tokenInvalidGrant = await readJsonResponse(await fetch(new URL("/token", server.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://claude.ai",
      },
      body: new URLSearchParams({
        client_id: "client-a",
        code: issued.code ?? "",
        code_verifier: "wrong-verifier",
        grant_type: "authorization_code",
        redirect_uri: "https://claude.ai/oauth/callback",
      }),
    }));

    const missingBearer = await readJsonResponse(await fetch(server.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    }));

    expect({
      oauthMetadata: {
        bytes: oauthMetadata.bytes,
        body: oauthMetadata.body,
      },
      protectedResource: {
        bytes: protectedResource.bytes,
        body: protectedResource.body,
      },
      registration: {
        bytes: registration.bytes,
        body: registration.body,
      },
      tokenSuccess: {
        bytes: tokenSuccess.bytes,
        body: tokenSuccess.body,
      },
      tokenInvalidGrant: {
        bytes: tokenInvalidGrant.bytes,
        body: tokenInvalidGrant.body,
      },
      missingBearer: {
        bytes: missingBearer.bytes,
        body: missingBearer.body,
      },
    }).toEqual({
      oauthMetadata: {
        bytes: 438,
        body: {
          authorization_endpoint: "https://mcp.example.com/authorize",
          code_challenge_methods_supported: ["S256"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          issuer: "https://mcp.example.com/",
          registration_endpoint: "https://mcp.example.com/register",
          response_types_supported: ["code"],
          scopes_supported: ["openid", "profile"],
          token_endpoint: "https://mcp.example.com/token",
          token_endpoint_auth_methods_supported: ["none"],
        },
      },
      protectedResource: {
        bytes: 133,
        body: {
          authorization_servers: ["https://mcp.example.com/"],
          bearer_methods_supported: ["header"],
          resource: "https://mcp.example.com/mcp",
        },
      },
      registration: {
        bytes: 269,
        body: {
          client_id: expect.any(String),
          client_id_issued_at: expect.any(Number),
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      },
      tokenSuccess: {
        bytes: 167,
        body: {
          access_token: expect.any(String),
          expires_in: 3600,
          refresh_token: expect.any(String),
          scope: "openid profile",
          token_type: "Bearer",
        },
      },
      tokenInvalidGrant: {
        bytes: 89,
        body: {
          error: "invalid_grant",
          error_description: "Authorization code has already been used.",
        },
      },
      missingBearer: {
        bytes: 25,
        body: {
          error: "invalid_token",
        },
      },
    });
  });

  it("keeps protected-resource metadata and bearer failures lean", async () => {
    const upstream = await startUpstreamOAuthServer(cleanups);
    const server = await startHttpServer({
      allowedOrigins: ["https://claude.ai"],
      auth: createCloudflareOAuthAuth({
        authorizationUrl: upstream.authorizationUrl,
        issuer: upstream.issuer,
        jwksUrl: upstream.jwksUrl,
        tokenUrl: upstream.tokenUrl,
      }),
      auth2Config: createAuth2Config(upstream),
      host: "127.0.0.1",
      path: "/mcp",
      port: 0,
      ynab,
    });
    cleanups.push(() => server.close());

    const protectedResource = await readJsonResponse(await fetch(new URL("/.well-known/oauth-protected-resource/mcp", server.url)));
    const missingBearer = await readJsonResponse(await fetch(server.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://claude.ai",
        "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "ynab_get_mcp_version",
          arguments: {},
        },
      }),
    }));

    expect(protectedResource.body).toEqual({
      authorization_servers: ["https://mcp.example.com/"],
      bearer_methods_supported: ["header"],
      resource: "https://mcp.example.com/mcp",
    });
    expect(protectedResource.bytes).toBeLessThan(150);
    expect(missingBearer.body).toEqual({
      error: "invalid_token",
    });
    expect(missingBearer.bytes).toBeLessThan(40);
  });
});
