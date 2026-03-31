import { describe, expect, it } from "vitest";

import { decideAuthAdmission } from "./authAdmissionPolicy.js";

describe("auth admission policy", () => {
  function getAdmission(jsonRpcMethod: string) {
    return decideAuthAdmission({
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      jsonRpcMethod,
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    });
  }

  it("treats OAuth metadata and route-family requests as public", () => {
    expect(decideAuthAdmission({
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

  it("allows the minimal unauthenticated MCP bootstrap methods", () => {
    expect(getAdmission("initialize")).toEqual({
      action: "allow_public",
      reason: "public-oauth-route",
    });

    expect(getAdmission("notifications/initialized")).toEqual({
      action: "allow_public",
      reason: "public-oauth-route",
    });

    expect(getAdmission("tools/list")).toEqual({
      action: "allow_public",
      reason: "public-oauth-route",
    });

    expect(getAdmission("resources/list")).toEqual({
      action: "allow_public",
      reason: "public-oauth-route",
    });
  });

  it("requires a bridge bearer token for protected MCP methods", () => {
    expect(getAdmission("tools/call")).toEqual({
      action: "require_bridge_bearer",
      reason: "protected-mcp-request",
    });

    expect(decideAuthAdmission({
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: false,
      jsonRpcMethod: "resources/read",
      method: "GET",
      mcpPath: "/mcp",
      path: "/mcp/resources/ynab_get_mcp_version",
    })).toEqual({
      action: "require_bridge_bearer",
      reason: "protected-mcp-request",
    });
  });

  it("rejects direct upstream bearer tokens before bridge auth", () => {
    expect(decideAuthAdmission({
      hasAuthorizationHeader: true,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: true,
      jsonRpcMethod: "tools/call",
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "reject_direct_upstream_bearer",
      reason: "direct-upstream-bearer",
    });

    expect(decideAuthAdmission({
      hasAuthorizationHeader: true,
      hasCfAccessJwtAssertion: false,
      isDirectUpstreamBearerToken: true,
      jsonRpcMethod: "tools/list",
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
      hasAuthorizationHeader: false,
      hasCfAccessJwtAssertion: true,
      isDirectUpstreamBearerToken: false,
      jsonRpcMethod: "tools/call",
      method: "POST",
      mcpPath: "/mcp",
      path: "/mcp",
    })).toEqual({
      action: "translate_cf_assertion_then_require_bearer",
      reason: "cf-access-jwt-assertion",
    });
  });
});
