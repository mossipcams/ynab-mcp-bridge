import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { OAuthGrant } from "./oauthGrant.js";
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
      principalId: "client-1",
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
      principalId: "client-1",
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
      grants: Record<string, unknown>;
      version: number;
    };

    expect(persistedState.version).toBe(2);
    expect(persistedState.grants).toEqual({});
  });

  it("stores the OAuth flow as a first-class grant and rotates its active keys", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const store = createOAuthStore(storePath);
    const upstreamTokens = {
      access_token: "upstream-token",
      refresh_token: "upstream-refresh-token",
      token_type: "Bearer",
    } as const;

    store.saveGrant({
      grantId: "grant-1",
      clientId: "client-1",
      clientName: "Claude Web",
      codeChallenge: "challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["profile", "openid", "openid"],
      state: "client-state",
      consent: {
        challenge: "consent-1",
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(store.getPendingConsentGrant("consent-1")).toMatchObject({
      grantId: "grant-1",
      scopes: ["openid", "profile"],
      consent: {
        challenge: "consent-1",
      },
    });

    store.saveGrant({
      grantId: "grant-1",
      clientId: "client-1",
      codeChallenge: "challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
      principalId: "client-1",
      upstreamTokens,
      authorizationCode: {
        code: "code-1",
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(store.getPendingConsentGrant("consent-1")).toBeUndefined();
    expect(store.getAuthorizationCodeGrant("code-1")).toMatchObject({
      grantId: "grant-1",
      authorizationCode: {
        code: "code-1",
      },
    });

    store.saveGrant({
      grantId: "grant-1",
      clientId: "client-1",
      codeChallenge: "challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      state: "client-state",
      principalId: "client-1",
      upstreamTokens,
      refreshToken: {
        token: "refresh-1",
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(store.getAuthorizationCodeGrant("code-1")).toBeUndefined();
    expect(store.getRefreshTokenGrant("refresh-1")).toMatchObject({
      grantId: "grant-1",
      refreshToken: {
        token: "refresh-1",
      },
    });

    const persistedState = JSON.parse(await readFile(storePath, "utf8")) as {
      grants: Record<string, { upstreamTokens?: Record<string, unknown> }>;
      version: number;
    };

    expect(persistedState.version).toBe(2);
    expect(Object.keys(persistedState.grants)).toEqual(["grant-1"]);
    expect(persistedState.grants["grant-1"]?.upstreamTokens).toMatchObject({
      refresh_token: "upstream-refresh-token",
      token_type: "Bearer",
    });
    expect(persistedState.grants["grant-1"]?.upstreamTokens).not.toHaveProperty("access_token");
  });

  it("normalizes legacy subject fields into a grant principal identity", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const store = createOAuthStore(storePath);
    store.saveGrant({
      grantId: "grant-1",
      clientId: "client-1",
      codeChallenge: "challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      subject: "client-1",
      upstreamTokens: {
        access_token: "upstream-token",
        token_type: "Bearer",
      },
      authorizationCode: {
        code: "code-1",
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(store.getGrant("grant-1")).toMatchObject({
      principalId: "client-1",
    });
    expect(store.getGrant("grant-1")).not.toHaveProperty("subject");
  });

  it("drops legacy OAuth state on load and falls back to a clean re-auth path", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    await writeFile(storePath, JSON.stringify({
      approvals: [],
      authorizationCodes: {
        "code-1": {
          clientId: "client-1",
          codeChallenge: "challenge",
          expiresAt: Date.now() + 60_000,
          redirectUri: "https://claude.ai/oauth/callback",
          resource: "https://mcp.example.com/mcp",
          scopes: ["profile", "openid"],
          state: "client-state",
          subject: "client-1",
          upstreamTokens: {
            access_token: "upstream-token",
            refresh_token: "upstream-refresh-token",
            token_type: "Bearer",
          },
        },
      },
      clients: {
        "client-1": {
          client_id: "client-1",
          client_id_issued_at: 1_700_000_000,
          client_name: "Claude Web",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/oauth/callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      },
      pendingAuthorizations: {
        "state-1": {
          clientId: "client-1",
          codeChallenge: "challenge",
          expiresAt: Date.now() + 60_000,
          redirectUri: "https://claude.ai/oauth/callback",
          resource: "https://mcp.example.com/mcp",
          scopes: ["openid", "profile"],
          state: "client-state",
        },
      },
      pendingConsents: {
        "consent-1": {
          clientId: "client-1",
          clientName: "Claude Web",
          codeChallenge: "challenge",
          expiresAt: Date.now() + 60_000,
          redirectUri: "https://claude.ai/oauth/callback",
          resource: "https://mcp.example.com/mcp",
          scopes: ["openid", "profile"],
          state: "client-state",
        },
      },
      refreshTokens: {
        "refresh-1": {
          clientId: "client-1",
          expiresAt: Date.now() + 60_000,
          resource: "https://mcp.example.com/mcp",
          scopes: ["openid", "profile"],
          subject: "client-1",
          upstreamTokens: {
            access_token: "upstream-token",
            refresh_token: "upstream-refresh-token",
            token_type: "Bearer",
          },
        },
      },
      version: 1,
    }, null, 2));

    const store = createOAuthStore(storePath);

    expect(store.getPendingConsentGrant("consent-1")).toBeUndefined();
    expect(store.getPendingAuthorizationGrant("state-1")).toBeUndefined();
    expect(store.getAuthorizationCodeGrant("code-1")).toBeUndefined();
    expect(store.getRefreshTokenGrant("refresh-1")).toBeUndefined();

    store.saveGrant({
      grantId: "grant-1",
      clientId: "client-1",
      codeChallenge: "challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      consent: {
        challenge: "consent-2",
        expiresAt: Date.now() + 60_000,
      },
    });

    expect(store.getPendingConsentGrant("consent-2")).toMatchObject({
      clientId: "client-1",
      consent: {
        challenge: "consent-2",
      },
    });

    const persistedState = JSON.parse(await readFile(storePath, "utf8")) as {
      authorizationCodes?: unknown;
      clients?: Record<string, unknown>;
      grants: Record<string, unknown>;
      pendingAuthorizations?: unknown;
      pendingConsents?: unknown;
      refreshTokens?: unknown;
      version: number;
    };

    expect(persistedState.version).toBe(2);
    expect(persistedState.pendingConsents).toBeUndefined();
    expect(persistedState.pendingAuthorizations).toBeUndefined();
    expect(persistedState.authorizationCodes).toBeUndefined();
    expect(persistedState.refreshTokens).toBeUndefined();
    expect(persistedState.clients).toEqual({});
    expect(Object.keys(persistedState.grants)).toEqual(["grant-1"]);
  });

  it("persists compatibility profiles for oauth clients and grants across reload", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "ynab-mcp-oauth-store-"));
    const storePath = path.join(tempDir, "oauth-store.json");
    cleanups.push(async () => {
      await rm(tempDir, { force: true, recursive: true });
    });

    const store = createOAuthStore(storePath);
    store.saveClient({
      client_id: "client-1",
      client_id_issued_at: 1_700_000_000,
      client_name: "ChatGPT Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://chatgpt.com/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    store.saveClientCompatibilityProfile("client-1", "chatgpt");

    const grant: OAuthGrant & { compatibilityProfileId: "chatgpt" } = {
      authorizationCode: {
        code: "code-1",
        expiresAt: Date.now() + 60_000,
      },
      clientId: "client-1",
      codeChallenge: "challenge",
      compatibilityProfileId: "chatgpt",
      grantId: "grant-1",
      principalId: "client-1",
      redirectUri: "https://chatgpt.com/oauth/callback",
      resource: "https://mcp.example.com/mcp",
      scopes: ["openid", "profile"],
      upstreamTokens: {
        access_token: "upstream-token",
        refresh_token: "upstream-refresh-token",
        token_type: "Bearer",
      },
    };

    store.saveGrant(grant);

    const reloadedStore = createOAuthStore(storePath);

    expect(reloadedStore.getClientCompatibilityProfile("client-1")).toBe("chatgpt");
    expect(reloadedStore.getGrant("grant-1")).toMatchObject({
      compatibilityProfileId: "chatgpt",
    });
    expect(reloadedStore.getAuthorizationCodeGrant("code-1")).toMatchObject({
      compatibilityProfileId: "chatgpt",
    });

    const persistedState = JSON.parse(await readFile(storePath, "utf8")) as {
      clientProfiles?: Record<string, unknown>;
      grants: Record<string, { compatibilityProfileId?: unknown }>;
    };

    expect(persistedState.clientProfiles).toEqual({
      "client-1": "chatgpt",
    });
    expect(persistedState.grants["grant-1"]?.compatibilityProfileId).toBe("chatgpt");
  });
});
