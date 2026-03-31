const PUBLIC_OAUTH_ROUTE_PATHS = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
  "/.well-known/oauth-protected-resource",
  "/authorize",
  "/authorize/consent",
  "/oauth/callback",
  "/register",
  "/token",
]);

export type AuthAdmissionDecision =
  | {
      action: "allow_public";
      reason: "public-oauth-route";
    }
  | {
      action: "reject_direct_upstream_bearer";
      reason: "direct-upstream-bearer";
    }
  | {
      action: "require_bridge_bearer";
      reason: "protected-mcp-request";
    }
  | {
      action: "translate_cf_assertion_then_require_bearer";
      reason: "cf-access-jwt-assertion";
    };

type AuthAdmissionInput = {
  hasAuthorizationHeader: boolean;
  hasCfAccessJwtAssertion: boolean;
  isDirectUpstreamBearerToken: boolean;
  method: string;
  mcpPath: string;
  path: string;
};

function isPublicOAuthRoute(path: string) {
  if (PUBLIC_OAUTH_ROUTE_PATHS.has(path)) {
    return true;
  }

  return path.startsWith("/.well-known/oauth-protected-resource/");
}

export function decideAuthAdmission(input: AuthAdmissionInput): AuthAdmissionDecision {
  if (isPublicOAuthRoute(input.path)) {
    return {
      action: "allow_public",
      reason: "public-oauth-route",
    };
  }

  if (input.path !== input.mcpPath || input.method !== "POST") {
    return {
      action: "allow_public",
      reason: "public-oauth-route",
    };
  }

  if (input.hasCfAccessJwtAssertion) {
    return {
      action: "translate_cf_assertion_then_require_bearer",
      reason: "cf-access-jwt-assertion",
    };
  }

  if (input.isDirectUpstreamBearerToken) {
    return {
      action: "reject_direct_upstream_bearer",
      reason: "direct-upstream-bearer",
    };
  }

  return {
    action: "require_bridge_bearer",
    reason: "protected-mcp-request",
  };
}
