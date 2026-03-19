import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectClientProfile,
  detectInitializeClientProfile,
  reconcileClientProfile,
} from "./clientProfiles/detectClient.js";
import { getClientProfile } from "./clientProfiles/index.js";
import { getResolvedClientProfile, setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";

describe("client profiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes a safe generic profile for OAuth setup behavior", () => {
    const profile = getClientProfile("generic");

    expect(profile).toMatchObject({
      id: "generic",
      oauth: {
        allowDynamicClientRegistration: true,
        discoveryPathVariants: ["/.well-known/oauth-authorization-server"],
        tolerateExtraDiscoveryProbes: false,
        tolerateMissingResourceParam: false,
        tokenRequestLeniency: "strict",
      },
      transport: {
        acceptSessionHeaderButIgnoreIt: false,
        preferJsonResponse: true,
        requireStatelessPostOnly: true,
      },
    });
    expect(profile.hooks.onAuthorizeRequest).toBeTypeOf("function");
    expect(profile.hooks.onDiscoveryRequest).toBeTypeOf("function");
    expect(profile.hooks.onInitialize).toBeTypeOf("function");
    expect(profile.hooks.onTokenRequest).toBeTypeOf("function");
    expect(profile.matchesInitialize(undefined, undefined)).toBe(false);
    expect(profile.matchesPreAuth({
      headers: {},
      method: "POST",
      path: "/mcp",
    })).toBe(false);
  });

  it("detects Claude setup requests from browser-originated traffic", () => {
    expect(detectClientProfile({
      headers: {
        origin: "https://claude.ai",
      },
      method: "POST",
      path: "/mcp",
    })).toEqual({
      profileId: "claude",
      reason: "origin:claude.ai",
    });
  });

  it("detects ChatGPT setup requests from the root protected-resource probe path", () => {
    expect(detectClientProfile({
      headers: {},
      method: "GET",
      path: "/.well-known/oauth-protected-resource",
    })).toEqual({
      profileId: "chatgpt",
      reason: "path:chatgpt-protected-resource-probe",
    });
  });

  it("detects Codex setup requests from OAuth discovery probe paths", () => {
    expect(detectClientProfile({
      headers: {},
      method: "GET",
      path: "/.well-known/oauth-authorization-server/sse",
    })).toEqual({
      profileId: "codex",
      reason: "path:codex-oauth-probe",
    });

    expect(detectClientProfile({
      headers: {},
      method: "GET",
      path: "/sse/.well-known/oauth-authorization-server",
    })).toEqual({
      profileId: "codex",
      reason: "path:codex-oauth-probe",
    });
  });

  it("falls back to the generic profile for unknown setup requests", () => {
    expect(detectClientProfile({
      headers: {
        origin: "https://example.com",
      },
      method: "POST",
      path: "/mcp",
    })).toEqual({
      profileId: "generic",
      reason: "fallback:generic",
    });
  });

  it("exposes a ChatGPT profile that keeps transport strict while allowing the root protected-resource probe", () => {
    const profile = getClientProfile("chatgpt");

    expect(profile).toMatchObject({
      id: "chatgpt",
      oauth: {
        allowDynamicClientRegistration: true,
        discoveryPathVariants: [
          "/.well-known/oauth-authorization-server",
          "/.well-known/oauth-protected-resource",
        ],
        tolerateExtraDiscoveryProbes: true,
        tolerateMissingResourceParam: false,
        tokenRequestLeniency: "strict",
      },
      transport: {
        acceptSessionHeaderButIgnoreIt: false,
        preferJsonResponse: true,
        requireStatelessPostOnly: true,
      },
    });
  });

  it("exposes a Claude profile that only relaxes the intended setup behavior", () => {
    const profile = getClientProfile("claude");

    expect(profile).toMatchObject({
      id: "claude",
      oauth: {
        allowDynamicClientRegistration: true,
        discoveryPathVariants: ["/.well-known/oauth-authorization-server"],
        tolerateExtraDiscoveryProbes: false,
        tolerateMissingResourceParam: true,
        tokenRequestLeniency: "normal",
      },
      transport: {
        acceptSessionHeaderButIgnoreIt: true,
        preferJsonResponse: true,
        requireStatelessPostOnly: true,
      },
    });

    expect(profile.matchesPreAuth({
      headers: {
        origin: "https://claude.ai",
      },
      method: "POST",
      path: "/mcp",
    })).toBe(true);
  });

  it("exposes a Codex profile that tolerates extra OAuth discovery probes safely", () => {
    const profile = getClientProfile("codex");

    expect(profile).toMatchObject({
      id: "codex",
      oauth: {
        allowDynamicClientRegistration: true,
        discoveryPathVariants: [
          "/.well-known/oauth-authorization-server",
          "/.well-known/oauth-authorization-server/sse",
          "/sse/.well-known/oauth-authorization-server",
        ],
        tolerateExtraDiscoveryProbes: true,
        tolerateMissingResourceParam: false,
        tokenRequestLeniency: "strict",
      },
      transport: {
        acceptSessionHeaderButIgnoreIt: false,
        preferJsonResponse: true,
        requireStatelessPostOnly: true,
      },
    });

    expect(profile.matchesPreAuth({
      headers: {},
      method: "GET",
      path: "/.well-known/oauth-authorization-server/sse",
    })).toBe(true);

    expect(profile.matchesPreAuth({
      headers: {},
      method: "GET",
      path: "/sse/.well-known/oauth-authorization-server",
    })).toBe(true);
  });

  it("keeps the documented pre-auth precedence when multiple profiles could match", () => {
    expect(detectClientProfile({
      headers: {
        origin: "https://claude.ai",
      },
      method: "GET",
      path: "/.well-known/oauth-authorization-server/sse",
    })).toEqual({
      profileId: "claude",
      reason: "origin:claude.ai",
    });
  });

  it("attaches a resolved client profile to request lifecycle context and logs the reason", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const locals: Record<string, unknown> = {};

    setResolvedClientProfile(locals, {
      profileId: "codex",
      reason: "path:codex-oauth-probe",
    });

    expect(getResolvedClientProfile(locals)).toEqual({
      profileId: "codex",
      reason: "path:codex-oauth-probe",
    });

    logClientProfileEvent("profile.detected", {
      path: "/.well-known/oauth-authorization-server/sse",
      profileId: "codex",
      reason: "path:codex-oauth-probe",
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith("[profile]", "profile.detected", {
      path: "/.well-known/oauth-authorization-server/sse",
      profileId: "codex",
      reason: "path:codex-oauth-probe",
    });
  });

  it("detects a profile from initialize clientInfo and capabilities when available", () => {
    const chatgptMatchesInitializeSpy = vi.spyOn(getClientProfile("chatgpt"), "matchesInitialize");
    const codexMatchesInitializeSpy = vi.spyOn(getClientProfile("codex"), "matchesInitialize");
    const claudeMatchesInitializeSpy = vi.spyOn(getClientProfile("claude"), "matchesInitialize");

    expect(detectInitializeClientProfile({
      capabilities: {},
      clientInfo: {
        name: "ChatGPT",
        version: "1.0.0",
      },
    })).toEqual({
      profileId: "chatgpt",
      reason: "initialize:client-info",
    });

    expect(detectInitializeClientProfile({
      capabilities: {},
      clientInfo: {
        name: "openai-mcp",
        version: "1.0.0",
      },
    })).toEqual({
      profileId: "chatgpt",
      reason: "initialize:client-info",
    });
    expect(chatgptMatchesInitializeSpy).toHaveBeenCalledWith({
      name: "ChatGPT",
      version: "1.0.0",
    }, {});

    expect(detectInitializeClientProfile({
      capabilities: {
        roots: {},
      },
      clientInfo: {
        name: "OpenAI Codex",
        version: "1.0.0",
      },
    })).toEqual({
      profileId: "codex",
      reason: "initialize:client-info",
    });
    expect(codexMatchesInitializeSpy).toHaveBeenCalledWith({
      name: "OpenAI Codex",
      version: "1.0.0",
    }, {
      roots: {},
    });

    expect(detectInitializeClientProfile({
      capabilities: {},
      clientInfo: {
        name: "Claude Desktop",
        version: "1.0.0",
      },
    })).toEqual({
      profileId: "claude",
      reason: "initialize:client-info",
    });
    expect(claudeMatchesInitializeSpy).toHaveBeenCalledWith({
      name: "Claude Desktop",
      version: "1.0.0",
    }, {});
  });

  it("promotes a generic provisional profile when initialize detection is more specific", () => {
    expect(reconcileClientProfile(
      {
        profileId: "generic",
        reason: "fallback:generic",
      },
      {
        profileId: "chatgpt",
        reason: "initialize:client-info",
      },
    )).toEqual({
      mismatch: false,
      profile: {
        profileId: "chatgpt",
        reason: "initialize:client-info",
      },
    });
  });

  it("keeps the safer generic profile when pre-auth and initialize detection disagree", () => {
    expect(reconcileClientProfile(
      {
        profileId: "claude",
        reason: "origin:claude.ai",
      },
      {
        profileId: "codex",
        reason: "initialize:client-info",
      },
    )).toEqual({
      mismatch: true,
      profile: {
        profileId: "generic",
        reason: "reconciled:generic",
      },
    });
  });
});
