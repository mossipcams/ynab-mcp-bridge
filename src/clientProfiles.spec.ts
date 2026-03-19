import { describe, expect, it } from "vitest";

import {
  detectClientProfile,
  detectInitializeClientProfile,
} from "./clientProfiles/detectClient.js";
import { getClientProfile } from "./clientProfiles/index.js";

describe("client profiles", () => {
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

  it("exposes a Claude profile with conservative browser-oriented defaults", () => {
    const profile = getClientProfile("claude");

    expect(profile).toMatchObject({
      id: "claude",
      oauth: {
        allowDynamicClientRegistration: true,
        discoveryPathVariants: [
          "/.well-known/oauth-authorization-server",
        ],
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
  });

  it("detects a ChatGPT profile from initialize client metadata", () => {
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
  });
});
