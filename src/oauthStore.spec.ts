import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createOAuthStore } from "./oauthStore.js";

describe("oauth store", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      await cleanup?.();
    }
  });

  it("drops expired consent, authorization, code, and refresh records when reloaded", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const expiredAt = Date.now() - 1_000;
    const store = createOAuthStore(storePath);
    store.savePendingConsent("consent-1", {
      clientId: "client-1",
      codeChallenge: "challenge",
      expiresAt: expiredAt,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
    });
    store.savePendingAuthorization("state-1", {
      clientId: "client-1",
      codeChallenge: "challenge",
      expiresAt: expiredAt,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
    });
    store.saveAuthorizationCode("code-1", {
      clientId: "client-1",
      codeChallenge: "challenge",
      expiresAt: expiredAt,
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
      subject: "client-1",
      upstreamTokens: {
        access_token: "upstream-token",
        token_type: "Bearer",
      },
    });
    store.saveRefreshToken("refresh-1", {
      clientId: "client-1",
      expiresAt: expiredAt,
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      subject: "client-1",
      upstreamTokens: {
        access_token: "upstream-token",
        token_type: "Bearer",
      },
    });

    const reloadedStore = createOAuthStore(storePath);

    expect(reloadedStore.getPendingConsent("consent-1")).toBeUndefined();
    expect(reloadedStore.getPendingAuthorization("state-1")).toBeUndefined();
    expect(reloadedStore.getAuthorizationCode("code-1")).toBeUndefined();
    expect(reloadedStore.getRefreshToken("refresh-1")).toBeUndefined();

    const persistedState = JSON.parse(await readFile(storePath, "utf8")) as {
      authorizationCodes: Record<string, unknown>;
      pendingAuthorizations: Record<string, unknown>;
      pendingConsents: Record<string, unknown>;
      refreshTokens: Record<string, unknown>;
    };

    expect(persistedState.pendingConsents).toEqual({});
    expect(persistedState.pendingAuthorizations).toEqual({});
    expect(persistedState.authorizationCodes).toEqual({});
    expect(persistedState.refreshTokens).toEqual({});
  });
});
