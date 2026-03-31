import { describe, expect, it } from "vitest";

import { decideAuthAdmission } from "./authAdmissionPolicy.js";

describe("auth admission policy", () => {
  it("treats OAuth metadata and route-family requests as public", () => {
    expect(decideAuthAdmission({
      body: undefined,
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      method: "GET",
      mcpPath: "/mcp",
      path: "/.well-known/oauth-authorization-server",
    })).toEqual({
      action: "allow_public",
      reason: "public-oauth-route",
    });

    expect(decideAuthAdmission({
      body: undefined,
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      method: "POST",
      mcpPath: "/mcp",
      path: "/token",
    })).toEqual({
      action: "allow_public",
      reason: "public-oauth-route",
    });

    expect(decideAuthAdmission({
      body: undefined,
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      method: "GET",
      mcpPath: "/mcp",
      path: "/.well-known/oauth-protected-resource/mcp",
    })).toEqual({
      action: "allow_public",
      reason: "public-oauth-route",
    });
  });

  it("requires a bridge bearer token for all MCP requests", () => {
    expect(decideAuthAdmission({
      body: {
        method: "initialize",
      },
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "require_bridge_bearer",
      reason: "protected-mcp-request",
    });

    expect(decideAuthAdmission({
      body: {
        method: "notifications/initialized",
      },
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "require_bridge_bearer",
      reason: "protected-mcp-request",
    });

    expect(decideAuthAdmission({
      body: {
        method: "tools/list",
      },
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "require_bridge_bearer",
      reason: "protected-mcp-request",
    });

    expect(decideAuthAdmission({
      body: {
        method: "resources/list",
      },
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "require_bridge_bearer",
      reason: "protected-mcp-request",
    });

    expect(decideAuthAdmission({
      body: {
        method: "tools/call",
      },
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "require_bridge_bearer",
      reason: "protected-mcp-request",
    });
  });

  it("rejects direct upstream bearer tokens before bridge auth", () => {
    expect(decideAuthAdmission({
      body: {
        method: "tools/call",
      },
      hasAuthorizationHeader: true,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: true,
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "reject_direct_upstream_bearer",
      reason: "direct-upstream-bearer",
    });
  });

  it("routes Cloudflare assertions through translation before bearer enforcement", () => {
    expect(decideAuthAdmission({
      body: {
        method: "tools/call",
      },
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: true,
      isDirectUpstreamBearerToken: false,
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "translate_cf_assertion_then_require_bearer",
      reason: "cf-access-jwt-assertion",
    });
  });
});
