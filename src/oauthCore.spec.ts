import { InvalidGrantError, InvalidRequestError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { describe, expect, it } from "vitest";

import type { ClientProfileId } from "./clientProfiles/types.js";
import { createOAuthCore } from "./oauthCore.js";
import type { OAuthGrant } from "./oauthGrant.js";

describe("createOAuthCore", () => {
  function createStore() {
    const clients = new Map<string, OAuthClientInformationFull>();
    const clientProfiles = new Map<string, ClientProfileId>();
    const approvals: Array<{ clientId: string; resource: string; scopes: string[] }> = [];
    const grants = new Map<string, OAuthGrant>();

    function findGrant(matcher: (grant: OAuthGrant) => boolean) {
      return Array.from(grants.values()).find(matcher);
    }

    return {
      approveClient(record: { clientId: string; resource: string; scopes: string[] }) {
        approvals.push({
          ...record,
          scopes: [...record.scopes],
        });
      },
      deleteGrant(grantId: string) {
        grants.delete(grantId);
      },
      getAuthorizationCodeGrant(code: string) {
        return findGrant((grant) => grant.authorizationCode?.code === code);
      },
      getClient(clientId: string) {
        return clients.get(clientId);
      },
      getClientCompatibilityProfile(clientId: string) {
        return clientProfiles.get(clientId);
      },
      getPendingAuthorizationGrant(stateId: string) {
        return findGrant((grant) => grant.pendingAuthorization?.stateId === stateId);
      },
      getPendingConsentGrant(consentId: string) {
        return findGrant((grant) => grant.consent?.challenge === consentId);
      },
      getRefreshTokenGrant(refreshToken: string) {
        return findGrant((grant) => grant.refreshToken?.token === refreshToken);
      },
      isClientApproved(record: { clientId: string; resource: string; scopes: string[] }) {
        return approvals.some((approval) => (
          approval.clientId === record.clientId &&
          approval.resource === record.resource &&
          approval.scopes.join(" ") === record.scopes.join(" ")
        ));
      },
      saveClient(client: OAuthClientInformationFull) {
        clients.set(client.client_id, client);
      },
      saveClientCompatibilityProfile(clientId: string, profileId: ClientProfileId) {
        clientProfiles.set(clientId, profileId);
      },
      saveGrant(grant: OAuthGrant) {
        grants.set(grant.grantId, grant);
      },
      state: {
        approvals,
        clients,
        clientProfiles,
        grants,
      },
    };
  }

  function createCore() {
    const store = createStore();
    const mintedAccessTokens: Array<{
      clientId: string;
      expiresInSeconds: number;
      principalId: string;
      resource: string;
      scopes: string[];
    }> = [];
    const upstreamCodeExchanges: string[] = [];
    const upstreamRefreshExchanges: string[] = [];
    let nextId = 0;

    const core = createOAuthCore({
      config: {
        callbackUrl: "https://mcp.example.com/oauth/callback",
        defaultResource: "https://mcp.example.com/mcp",
        defaultScopes: ["openid", "profile"],
      },
      dependencies: {
        createId: () => `generated-${++nextId}`,
        createUpstreamAuthorizationUrl: (pending) => {
          const url = new URL("https://upstream.example.com/authorize");
          url.searchParams.set("state", pending.upstreamState);
          url.searchParams.set("redirect_uri", "https://mcp.example.com/oauth/callback");
          url.searchParams.set("resource", pending.resource);
          url.searchParams.set("scope", pending.scopes.join(" "));
          return url.href;
        },
        exchangeUpstreamAuthorizationCode: async (code) => {
          upstreamCodeExchanges.push(code);
          return {
            access_token: "upstream-access-token",
            expires_in: 1800,
            refresh_token: "upstream-refresh-token",
            token_type: "Bearer",
          } satisfies OAuthTokens;
        },
        exchangeUpstreamRefreshToken: async (refreshToken) => {
          upstreamRefreshExchanges.push(refreshToken);
          return {
            access_token: "upstream-refresh-token-access",
            expires_in: 1200,
            refresh_token: "upstream-refresh-token-rotated",
            token_type: "Bearer",
          } satisfies OAuthTokens;
        },
        mintAccessToken: async (record) => {
          mintedAccessTokens.push(record);
          return `local-access-token-${mintedAccessTokens.length}`;
        },
        now: () => 1_700_000_000_000,
      },
      store,
    });

    return {
      core,
      mintedAccessTokens,
      store,
      upstreamCodeExchanges,
      upstreamRefreshExchanges,
    };
  }

  it("registers clients and persists the issued metadata", async () => {
    const { core, store } = createCore();

    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    expect(client).toMatchObject({
      client_id: "generated-1",
      client_id_issued_at: 1700000000,
      client_name: "Claude Web",
    });
    expect(store.state.clients.get("generated-1")).toEqual(client);
  });

  it("requires consent for unapproved clients and redirects approved clients upstream", async () => {
    const { core, store } = createCore();
    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    const consentResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    expect(consentResult).toMatchObject({
      type: "consent",
      consentChallenge: "generated-2",
    });
    expect(store.state.grants.get("generated-2")).toMatchObject({
      clientId: client.client_id,
      consent: {
        challenge: "generated-2",
      },
      redirectUri: "https://claude.ai/oauth/callback",
    });

    await core.approveConsent("generated-2", "approve");

    const redirectResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    expect(redirectResult).toMatchObject({
      type: "redirect",
    });
    if (redirectResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }
    expect(new URL(redirectResult.location).origin).toBe("https://upstream.example.com");
  });

  it("approves consent, handles the callback, and exchanges authorization codes for local tokens", async () => {
    const { core, mintedAccessTokens, store, upstreamCodeExchanges } = createCore();
    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    const consentResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    if (consentResult.type !== "consent") {
      throw new Error("Expected consent result");
    }

    const approvalResult = await core.approveConsent(consentResult.consentChallenge, "approve");

    if (approvalResult.type !== "redirect") {
      throw new Error("Expected upstream redirect");
    }

    const upstreamState = new URL(approvalResult.location).searchParams.get("state");
    const callbackResult = await core.handleCallback({
      code: "upstream-code-123",
      upstreamState: upstreamState!,
    });

    expect(upstreamCodeExchanges).toEqual(["upstream-code-123"]);
    expect(callbackResult).toMatchObject({
      type: "redirect",
    });
    if (callbackResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }
    const localAuthorizationCode = new URL(callbackResult.location).searchParams.get("code");
    expect(localAuthorizationCode).toBe("generated-4");
    expect(await core.getAuthorizationCodeChallenge(client, localAuthorizationCode!)).toBe("pkce-challenge");

    const tokenResult = await core.exchangeAuthorizationCode(
      client,
      localAuthorizationCode!,
      "https://claude.ai/oauth/callback",
      new URL("https://mcp.example.com/mcp"),
    );

    expect(tokenResult).toMatchObject({
      access_token: "local-access-token-1",
      refresh_token: "generated-5",
      token_type: "Bearer",
    });
    expect(mintedAccessTokens).toEqual([
      {
        clientId: client.client_id,
        expiresInSeconds: 1800,
        principalId: client.client_id,
        resource: "https://mcp.example.com/mcp",
        scopes: ["openid", "profile", "offline_access"],
      },
    ]);
    expect(store.state.grants.get("generated-2")).toMatchObject({
      clientId: client.client_id,
      refreshToken: {
        token: "generated-5",
      },
      upstreamTokens: {
        expires_in: 1800,
        refresh_token: "upstream-refresh-token",
        token_type: "Bearer",
      },
    });
    expect(store.state.grants.get("generated-2")?.upstreamTokens).not.toHaveProperty("access_token");
    expect(store.state.grants.size).toBe(1);
  });

  it("keeps the consent grant when approving consent cannot persist the pending authorization step", async () => {
    const store = createStore();
    let nextId = 0;
    let failPendingAuthorizationSave = false;
    const originalSaveGrant = store.saveGrant;

    store.saveGrant = (grant) => {
      if (failPendingAuthorizationSave && grant.pendingAuthorization) {
        throw new Error("Simulated grant persistence failure.");
      }

      originalSaveGrant(grant);
    };

    const core = createOAuthCore({
      config: {
        callbackUrl: "https://mcp.example.com/oauth/callback",
        defaultResource: "https://mcp.example.com/mcp",
        defaultScopes: ["openid", "profile"],
      },
      dependencies: {
        createId: () => `generated-${++nextId}`,
        createUpstreamAuthorizationUrl: (pending) => {
          const url = new URL("https://upstream.example.com/authorize");
          url.searchParams.set("state", pending.upstreamState);
          return url.href;
        },
        exchangeUpstreamAuthorizationCode: async () => ({
          access_token: "upstream-access-token",
          token_type: "Bearer",
        }),
        exchangeUpstreamRefreshToken: async () => ({
          access_token: "upstream-refresh-token-access",
          token_type: "Bearer",
        }),
        mintAccessToken: async () => "local-access-token-1",
        now: () => 1_700_000_000_000,
      },
      store,
    });
    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    const consentResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    if (consentResult.type !== "consent") {
      throw new Error("Expected consent result");
    }

    failPendingAuthorizationSave = true;

    await expect(core.approveConsent(consentResult.consentChallenge, "approve")).rejects.toThrow(
      "Simulated grant persistence failure.",
    );
    expect(store.state.grants.get(consentResult.consentChallenge)).toMatchObject({
      consent: {
        challenge: consentResult.consentChallenge,
      },
      grantId: consentResult.consentChallenge,
    });
  });

  it("keeps the pending authorization grant when callback handling cannot persist the authorization code step", async () => {
    const store = createStore();
    let nextId = 0;
    let failAuthorizationCodeSave = false;
    const originalSaveGrant = store.saveGrant;

    store.saveGrant = (grant) => {
      if (failAuthorizationCodeSave && grant.authorizationCode) {
        throw new Error("Simulated authorization-code persistence failure.");
      }

      originalSaveGrant(grant);
    };

    const core = createOAuthCore({
      config: {
        callbackUrl: "https://mcp.example.com/oauth/callback",
        defaultResource: "https://mcp.example.com/mcp",
        defaultScopes: ["openid", "profile"],
      },
      dependencies: {
        createId: () => `generated-${++nextId}`,
        createUpstreamAuthorizationUrl: (pending) => {
          const url = new URL("https://upstream.example.com/authorize");
          url.searchParams.set("state", pending.upstreamState);
          return url.href;
        },
        exchangeUpstreamAuthorizationCode: async () => ({
          access_token: "upstream-access-token",
          token_type: "Bearer",
        }),
        exchangeUpstreamRefreshToken: async () => ({
          access_token: "upstream-refresh-token-access",
          token_type: "Bearer",
        }),
        mintAccessToken: async () => "local-access-token-1",
        now: () => 1_700_000_000_000,
      },
      store,
    });
    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    const consentResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    if (consentResult.type !== "consent") {
      throw new Error("Expected consent result");
    }

    const approvalResult = await core.approveConsent(consentResult.consentChallenge, "approve");

    if (approvalResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }

    failAuthorizationCodeSave = true;
    const upstreamState = new URL(approvalResult.location).searchParams.get("state");

    await expect(core.handleCallback({
      code: "upstream-code-123",
      upstreamState: upstreamState!,
    })).rejects.toThrow("Simulated authorization-code persistence failure.");
    expect(store.getPendingAuthorizationGrant(upstreamState!)).toMatchObject({
      grantId: consentResult.consentChallenge,
      pendingAuthorization: {
        stateId: upstreamState,
      },
    });
  });

  it("keeps the authorization code grant when token exchange cannot persist the refresh-token step", async () => {
    const store = createStore();
    let nextId = 0;
    let failRefreshTokenSave = false;
    const originalSaveGrant = store.saveGrant;

    store.saveGrant = (grant) => {
      if (failRefreshTokenSave && grant.refreshToken) {
        throw new Error("Simulated refresh-token persistence failure.");
      }

      originalSaveGrant(grant);
    };

    const core = createOAuthCore({
      config: {
        callbackUrl: "https://mcp.example.com/oauth/callback",
        defaultResource: "https://mcp.example.com/mcp",
        defaultScopes: ["openid", "profile"],
      },
      dependencies: {
        createId: () => `generated-${++nextId}`,
        createUpstreamAuthorizationUrl: (pending) => {
          const url = new URL("https://upstream.example.com/authorize");
          url.searchParams.set("state", pending.upstreamState);
          return url.href;
        },
        exchangeUpstreamAuthorizationCode: async () => ({
          access_token: "upstream-access-token",
          expires_in: 1800,
          refresh_token: "upstream-refresh-token",
          token_type: "Bearer",
        }),
        exchangeUpstreamRefreshToken: async () => ({
          access_token: "upstream-refresh-token-access",
          token_type: "Bearer",
        }),
        mintAccessToken: async () => "local-access-token-1",
        now: () => 1_700_000_000_000,
      },
      store,
    });
    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    const consentResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    if (consentResult.type !== "consent") {
      throw new Error("Expected consent result");
    }

    const approvalResult = await core.approveConsent(consentResult.consentChallenge, "approve");

    if (approvalResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }

    const upstreamState = new URL(approvalResult.location).searchParams.get("state");
    const callbackResult = await core.handleCallback({
      code: "upstream-code-123",
      upstreamState: upstreamState!,
    });

    if (callbackResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }

    failRefreshTokenSave = true;
    const authorizationCode = new URL(callbackResult.location).searchParams.get("code");

    await expect(core.exchangeAuthorizationCode(
      client,
      authorizationCode!,
      "https://claude.ai/oauth/callback",
      new URL("https://mcp.example.com/mcp"),
    )).rejects.toThrow("Simulated refresh-token persistence failure.");
    expect(store.getAuthorizationCodeGrant(authorizationCode!)).toMatchObject({
      grantId: consentResult.consentChallenge,
      authorizationCode: {
        code: authorizationCode,
      },
    });
  });

  it("refreshes local tokens against the upstream provider and rejects mismatched redirect or resource values", async () => {
    const { core, upstreamRefreshExchanges } = createCore();
    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    const consentResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    if (consentResult.type !== "consent") {
      throw new Error("Expected consent result");
    }

    const approvalResult = await core.approveConsent(consentResult.consentChallenge, "approve");

    if (approvalResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }

    const upstreamState = new URL(approvalResult.location).searchParams.get("state");
    const callbackResult = await core.handleCallback({
      code: "upstream-code-123",
      upstreamState: upstreamState!,
    });

    if (callbackResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }

    const authorizationCode = new URL(callbackResult.location).searchParams.get("code");

    await expect(core.exchangeAuthorizationCode(
      client,
      authorizationCode!,
      "https://claude.ai/other",
      new URL("https://mcp.example.com/mcp"),
    )).rejects.toThrow(InvalidGrantError);

    const initialTokens = await core.exchangeAuthorizationCode(
      client,
      authorizationCode!,
      "https://claude.ai/oauth/callback",
      new URL("https://mcp.example.com/mcp"),
    );

    await expect(core.exchangeRefreshToken(
      client,
      initialTokens.refresh_token!,
      undefined,
      new URL("https://other.example.com/resource"),
    )).rejects.toThrow(InvalidGrantError);

    const refreshedTokens = await core.exchangeRefreshToken(
      client,
      initialTokens.refresh_token!,
      ["openid"],
      new URL("https://mcp.example.com/mcp"),
    );

    expect(refreshedTokens).toMatchObject({
      access_token: "local-access-token-2",
      refresh_token: "generated-6",
    });
    expect(upstreamRefreshExchanges).toEqual(["upstream-refresh-token"]);

    await expect(core.exchangeRefreshToken(
      client,
      initialTokens.refresh_token!,
      ["openid"],
      new URL("https://mcp.example.com/mcp"),
    )).rejects.toThrow(InvalidGrantError);
  });

  it("returns an OAuth error redirect when consent is denied and rejects unknown callback state", async () => {
    const { core } = createCore();
    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    const consentResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    if (consentResult.type !== "consent") {
      throw new Error("Expected consent result");
    }

    const denialResult = await core.approveConsent(consentResult.consentChallenge, "deny");

    expect(denialResult).toMatchObject({
      type: "redirect",
    });
    if (denialResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }
    const denialUrl = new URL(denialResult.location);
    expect(denialUrl.searchParams.get("error")).toBe("access_denied");
    expect(denialUrl.searchParams.get("state")).toBe("client-state");

    await expect(core.handleCallback({
      code: "upstream-code-123",
      upstreamState: "missing-state",
    })).rejects.toThrow(InvalidRequestError);
  });

  it("rejects client metadata without at least one https redirect URI", async () => {
    const { core } = createCore();
    const missingRedirectUrisClient = {
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    } as unknown as Parameters<typeof core.registerClient>[0];

    await expect(core.registerClient(missingRedirectUrisClient))
      .rejects.toThrow("redirect_uris must contain at least one https redirect URI.");

    await expect(core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    })).rejects.toThrow("redirect_uris must contain at least one https redirect URI.");
  });

  it("rejects malformed authorization inputs before client matching", async () => {
    const { core } = createCore();
    const client = await core.registerClient({
      client_name: "Claude Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    await expect(core.startAuthorization(client, {
      codeChallenge: "",
      redirectUri: "https://claude.ai/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
    })).rejects.toThrow("code_challenge is required.");

    await expect(core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
    })).rejects.toThrow("redirect_uri is required.");
  });

  it("carries a stored compatibility profile across grant rotation and refresh lookup", async () => {
    const { core, store } = createCore();
    const client = await core.registerClient({
      client_name: "ChatGPT Web",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://chatgpt.com/oauth/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    store.saveClientCompatibilityProfile(client.client_id, "chatgpt");

    const consentResult = await core.startAuthorization(client, {
      codeChallenge: "pkce-challenge",
      redirectUri: "https://chatgpt.com/oauth/callback",
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: ["openid", "profile"],
      state: "client-state",
    });

    if (consentResult.type !== "consent") {
      throw new Error("Expected consent result");
    }

    expect(store.state.grants.get(consentResult.consentChallenge)).toMatchObject({
      compatibilityProfileId: "chatgpt",
    });

    const approvalResult = await core.approveConsent(consentResult.consentChallenge, "approve");

    if (approvalResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }

    const upstreamState = new URL(approvalResult.location).searchParams.get("state");
    expect(store.getPendingAuthorizationGrant(upstreamState!)).toMatchObject({
      compatibilityProfileId: "chatgpt",
    });

    const callbackResult = await core.handleCallback({
      code: "upstream-code-123",
      upstreamState: upstreamState!,
    });

    if (callbackResult.type !== "redirect") {
      throw new Error("Expected redirect result");
    }

    const authorizationCode = new URL(callbackResult.location).searchParams.get("code");
    expect(store.getAuthorizationCodeGrant(authorizationCode!)).toMatchObject({
      compatibilityProfileId: "chatgpt",
    });

    const initialTokens = await core.exchangeAuthorizationCode(
      client,
      authorizationCode!,
      "https://chatgpt.com/oauth/callback",
      new URL("https://mcp.example.com/mcp"),
    );

    expect(store.getRefreshTokenGrant(initialTokens.refresh_token!)).toMatchObject({
      compatibilityProfileId: "chatgpt",
    });

    const refreshedTokens = await core.exchangeRefreshToken(
      client,
      initialTokens.refresh_token!,
      ["openid", "profile"],
      new URL("https://mcp.example.com/mcp"),
    );

    expect(store.getRefreshTokenGrant(refreshedTokens.refresh_token!)).toMatchObject({
      compatibilityProfileId: "chatgpt",
    });
  });
});
