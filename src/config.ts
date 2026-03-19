import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

type RuntimeTransport = "http" | "stdio";
type DeploymentMode = "authless" | "oauth-single-tenant" | "oauth-hardened";

export type RuntimeAuthConfig =
  | {
      deployment: "authless";
      mode: "none";
    }
  | {
      audience: string;
      authorizationUrl: string;
      callbackPath: string;
      clientId: string;
      clientSecret: string;
      deployment: Exclude<DeploymentMode, "authless">;
      issuer: string;
      jwksUrl: string;
      mode: "oauth";
      publicUrl: string;
      scopes: string[];
      storePath?: string;
      tokenSigningSecret?: string;
      tokenUrl: string;
    };

type RuntimeConfig = {
  allowedOrigins: string[];
  allowedHosts: string[];
  auth: RuntimeAuthConfig;
  host: string;
  path: string;
  port: number;
  transport: RuntimeTransport;
};

export type YnabConfig = {
  apiToken: string;
  planId?: string;
};

type AppConfig = {
  runtime: RuntimeConfig;
  ynab: YnabConfig;
};

type EnvConfig = Record<string, string | undefined>;

type BackendReadiness = {
  checks: {
    ynabApiToken: boolean;
    ynabPlanIdConfigured: boolean;
  };
  planResolution: "configured" | "dynamic";
  status: "ok" | "misconfigured";
};

const CLOUDFLARE_ACCESS_ERROR =
  "Cloudflare Access OAuth settings must use the per-application OIDC SaaS endpoints under /cdn-cgi/access/sso/oidc/<client-id> for issuer, authorization, token, and jwks URLs.";

function isCloudflareAccessHostname(hostname: string) {
  return hostname === "cloudflareaccess.com" || hostname.endsWith(".cloudflareaccess.com");
}

function getCloudflareAccessClientId(url: URL, endpoint: "authorization" | "issuer" | "jwks" | "token") {
  const segments = url.pathname
    .split("/")
    .filter(Boolean);

  if (
    segments[0] !== "cdn-cgi" ||
    segments[1] !== "access" ||
    segments[2] !== "sso" ||
    segments[3] !== "oidc"
  ) {
    return undefined;
  }

  const clientId = segments[4];

  if (!clientId) {
    return undefined;
  }

  if (endpoint === "issuer") {
    return segments.length === 5 ? clientId : undefined;
  }

  return segments.length === 6 && segments[5] === endpoint
    ? clientId
    : undefined;
}

export function validateCloudflareAccessOAuthSettings(config: {
  authorizationUrl: string;
  issuer: string;
  jwksUrl: string;
  tokenUrl: string;
}) {
  const authorizationUrl = new URL(config.authorizationUrl);
  const issuerUrl = new URL(config.issuer);
  const jwksUrl = new URL(config.jwksUrl);
  const tokenUrl = new URL(config.tokenUrl);
  const cloudflareCoreUrls = [authorizationUrl, issuerUrl, tokenUrl];
  const includesCloudflareAccess = [authorizationUrl, issuerUrl, jwksUrl, tokenUrl].some((url) => (
    isCloudflareAccessHostname(url.hostname)
  ));

  if (!includesCloudflareAccess) {
    return;
  }

  if (!cloudflareCoreUrls.every((url) => isCloudflareAccessHostname(url.hostname))) {
    throw new Error(CLOUDFLARE_ACCESS_ERROR);
  }

  const authorizationClientId = getCloudflareAccessClientId(authorizationUrl, "authorization");
  const issuerClientId = getCloudflareAccessClientId(issuerUrl, "issuer");
  const tokenClientId = getCloudflareAccessClientId(tokenUrl, "token");

  if (!authorizationClientId || !issuerClientId || !tokenClientId) {
    throw new Error(CLOUDFLARE_ACCESS_ERROR);
  }

  if (
    authorizationUrl.origin !== issuerUrl.origin ||
    authorizationUrl.origin !== tokenUrl.origin ||
    authorizationClientId !== issuerClientId ||
    authorizationClientId !== tokenClientId
  ) {
    throw new Error(CLOUDFLARE_ACCESS_ERROR);
  }

  if (isCloudflareAccessHostname(jwksUrl.hostname)) {
    const jwksClientId = getCloudflareAccessClientId(jwksUrl, "jwks");

    if (
      !jwksClientId ||
      authorizationUrl.origin !== jwksUrl.origin ||
      authorizationClientId !== jwksClientId
    ) {
      throw new Error(CLOUDFLARE_ACCESS_ERROR);
    }
  }
}

function readFlag(args: string[], name: string) {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function readOptionalValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readPathValue(value: string | undefined, name: string) {
  const normalized = readOptionalValue(value);

  if (!normalized) {
    return undefined;
  }

  if (!normalized.startsWith("/")) {
    throw new Error(`${name} must start with '/'.`);
  }

  return normalized;
}

function readFilePathValue(value: string | undefined) {
  const normalized = readOptionalValue(value);
  return normalized ? normalized : undefined;
}

function hasValue(value: string | undefined) {
  return readOptionalValue(value) !== undefined;
}

function parseCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getEffectiveOAuthScopes(scopes: string[]) {
  const normalizedScopes = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];

  if (!normalizedScopes.includes("offline_access")) {
    normalizedScopes.push("offline_access");
  }

  return normalizedScopes;
}

function readCsvFlag(args: string[], name: string) {
  const value = readFlag(args, name);

  if (!value) {
    return [];
  }

  return parseCsv(value);
}

function readUrlLikeValue(value: string | undefined, name: string) {
  const normalized = readOptionalValue(value);

  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);

    if (url.pathname === "/" && !url.search && !url.hash) {
      return url.origin;
    }

    return url.toString();
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function readHostnameLikeValue(value: string | undefined, name: string) {
  const normalized = readOptionalValue(value);

  if (!normalized) {
    return undefined;
  }

  try {
    return new URL(normalized.includes("://") ? normalized : `https://${normalized}`).hostname;
  } catch {
    throw new Error(`${name} must be a valid hostname or URL.`);
  }
}

function buildCallbackUrl(publicUrl: string | undefined, callbackPath: string | undefined) {
  if (!publicUrl || !callbackPath) {
    return undefined;
  }

  return new URL(callbackPath, new URL(publicUrl).origin).href;
}

function buildCloudflareAccessUrls(hostname: string | undefined, clientId: string | undefined) {
  if (!hostname || !clientId) {
    return undefined;
  }

  const issuer = `https://${hostname}/cdn-cgi/access/sso/oidc/${clientId}`;

  return {
    authorizationUrl: `${issuer}/authorization`,
    issuer,
    jwksUrl: `${issuer}/jwks`,
    tokenUrl: `${issuer}/token`,
  };
}

function getDefaultOAuthStorePath() {
  return path.join(homedir(), ".ynab-mcp-bridge", "oauth-store.json");
}

function deriveTokenSigningSecret(clientSecret: string | undefined, publicUrl: string | undefined, clientId: string | undefined) {
  if (!clientSecret || !publicUrl || !clientId) {
    return undefined;
  }

  return createHash("sha256")
    .update(`${clientSecret}\n${publicUrl}\n${clientId}`)
    .digest("base64url");
}

function readLegacyAuthMode(args: string[], env: EnvConfig) {
  const authMode = readOptionalValue(readFlag(args, "--auth-mode")) ?? readOptionalValue(env.MCP_AUTH_MODE);

  if (!authMode) {
    return undefined;
  }

  if (authMode !== "none" && authMode !== "oauth") {
    throw new Error(`Unsupported auth mode: ${authMode}`);
  }

  return authMode;
}

function readDeploymentMode(args: string[], env: EnvConfig): DeploymentMode {
  const deploymentMode = readOptionalValue(readFlag(args, "--deployment-mode")) ?? readOptionalValue(env.MCP_DEPLOYMENT_MODE);
  const legacyAuthMode = readLegacyAuthMode(args, env);

  if (deploymentMode) {
    if (
      deploymentMode !== "authless" &&
      deploymentMode !== "oauth-single-tenant" &&
      deploymentMode !== "oauth-hardened"
    ) {
      throw new Error(`Unsupported deployment mode: ${deploymentMode}`);
    }

    if (legacyAuthMode === "oauth" && deploymentMode === "authless") {
      throw new Error("MCP_DEPLOYMENT_MODE=authless is incompatible with MCP_AUTH_MODE=oauth.");
    }

    if (legacyAuthMode === "none" && deploymentMode !== "authless") {
      throw new Error(`MCP_DEPLOYMENT_MODE=${deploymentMode} is incompatible with MCP_AUTH_MODE=none.`);
    }

    return deploymentMode;
  }

  return legacyAuthMode === "oauth" ? "oauth-single-tenant" : "authless";
}

function resolveRuntimeAuthConfig(args: string[], env: EnvConfig): RuntimeAuthConfig {
  const deployment = readDeploymentMode(args, env);
  const explicitDeploymentMode = readOptionalValue(readFlag(args, "--deployment-mode")) ?? readOptionalValue(env.MCP_DEPLOYMENT_MODE);

  if (deployment === "authless") {
    return {
      deployment,
      mode: "none",
    };
  }

  const callbackPath = readPathValue(
    readFlag(args, "--oauth-callback-path") ?? env.MCP_OAUTH_CALLBACK_PATH ?? "/oauth/callback",
    "MCP_OAUTH_CALLBACK_PATH",
  );
  const publicUrl = readUrlLikeValue(readFlag(args, "--public-url") ?? env.MCP_PUBLIC_URL, "MCP_PUBLIC_URL");
  const clientId = readOptionalValue(readFlag(args, "--oauth-client-id") ?? env.MCP_OAUTH_CLIENT_ID);
  const clientSecret = readOptionalValue(readFlag(args, "--oauth-client-secret") ?? env.MCP_OAUTH_CLIENT_SECRET);
  const cloudflareDomain = readHostnameLikeValue(
    readFlag(args, "--oauth-cloudflare-domain") ?? env.MCP_OAUTH_CLOUDFLARE_DOMAIN,
    "MCP_OAUTH_CLOUDFLARE_DOMAIN",
  );
  const cloudflareAccessUrls = buildCloudflareAccessUrls(cloudflareDomain, clientId);
  const issuer = readUrlLikeValue(readFlag(args, "--oauth-issuer") ?? env.MCP_OAUTH_ISSUER, "MCP_OAUTH_ISSUER")
    ?? cloudflareAccessUrls?.issuer;
  const authorizationUrl = readUrlLikeValue(
    readFlag(args, "--oauth-authorization-url") ?? env.MCP_OAUTH_AUTHORIZATION_URL,
    "MCP_OAUTH_AUTHORIZATION_URL",
  ) ?? cloudflareAccessUrls?.authorizationUrl;
  const tokenUrl = readUrlLikeValue(readFlag(args, "--oauth-token-url") ?? env.MCP_OAUTH_TOKEN_URL, "MCP_OAUTH_TOKEN_URL")
    ?? cloudflareAccessUrls?.tokenUrl;
  const jwksUrl = readUrlLikeValue(readFlag(args, "--oauth-jwks-url") ?? env.MCP_OAUTH_JWKS_URL, "MCP_OAUTH_JWKS_URL")
    ?? cloudflareAccessUrls?.jwksUrl;
  const audience = readOptionalValue(readFlag(args, "--oauth-audience") ?? env.MCP_OAUTH_AUDIENCE) ?? publicUrl;
  const storePath = readFilePathValue(readFlag(args, "--oauth-store-path") ?? env.MCP_OAUTH_STORE_PATH)
    ?? getDefaultOAuthStorePath();
  const tokenSigningSecret = readOptionalValue(readFlag(args, "--oauth-token-signing-secret") ?? env.MCP_OAUTH_TOKEN_SIGNING_SECRET)
    ?? deriveTokenSigningSecret(clientSecret, publicUrl, clientId);

  if (!issuer || !authorizationUrl || !tokenUrl || !jwksUrl || !audience || !publicUrl || !clientId || !clientSecret || !callbackPath || !storePath || !tokenSigningSecret) {
    if (explicitDeploymentMode) {
      const callbackUrl = buildCallbackUrl(publicUrl, callbackPath);

      throw new Error(
        `OAuth deployment requires MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, and either MCP_OAUTH_CLOUDFLARE_DOMAIN or the explicit MCP_OAUTH_ISSUER, MCP_OAUTH_AUTHORIZATION_URL, MCP_OAUTH_TOKEN_URL, and MCP_OAUTH_JWKS_URL settings.${callbackUrl ? ` The callback URL to register upstream is ${callbackUrl}.` : ""}`,
      );
    }
    throw new Error(
      "OAuth mode requires MCP_PUBLIC_URL, MCP_OAUTH_ISSUER, MCP_OAUTH_AUTHORIZATION_URL, MCP_OAUTH_TOKEN_URL, MCP_OAUTH_JWKS_URL, MCP_OAUTH_AUDIENCE, MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, MCP_OAUTH_STORE_PATH, and MCP_OAUTH_TOKEN_SIGNING_SECRET.",
    );
  }

  validateCloudflareAccessOAuthSettings({
    authorizationUrl,
    issuer,
    jwksUrl,
    tokenUrl,
  });

  const scopes = getEffectiveOAuthScopes(parseCsv(readFlag(args, "--oauth-scopes") ?? env.MCP_OAUTH_SCOPES ?? ""));

  return {
    audience,
    authorizationUrl,
    callbackPath,
    clientId,
    clientSecret,
    deployment,
    issuer,
    jwksUrl,
    mode: "oauth",
    publicUrl,
    scopes,
    storePath,
    tokenSigningSecret,
    tokenUrl,
  };
}

function getBackendReadiness(env: EnvConfig): BackendReadiness {
  const ynabApiToken = hasValue(env.YNAB_API_TOKEN);
  const ynabPlanIdConfigured = hasValue(env.YNAB_PLAN_ID);

  return {
    status: ynabApiToken ? "ok" : "misconfigured",
    planResolution: ynabPlanIdConfigured ? "configured" : "dynamic",
    checks: {
      ynabApiToken,
      ynabPlanIdConfigured,
    },
  };
}

export function assertBackendEnvironment(env: EnvConfig) {
  const readiness = getBackendReadiness(env);

  if (!readiness.checks.ynabApiToken) {
    throw new Error("YNAB_API_TOKEN is required.");
  }

  return readiness;
}

export function readYnabConfig(env: EnvConfig): YnabConfig {
  return {
    apiToken: readOptionalValue(env.YNAB_API_TOKEN) ?? "",
    planId: readOptionalValue(env.YNAB_PLAN_ID),
  };
}

export function assertYnabConfig(config: YnabConfig | undefined): YnabConfig {
  const apiToken = readOptionalValue(config?.apiToken);

  if (!apiToken) {
    throw new Error("YNAB config is required.");
  }

  return {
    apiToken,
    planId: readOptionalValue(config?.planId),
  };
}

export function resolveRuntimeConfig(args: string[], env: EnvConfig): RuntimeConfig {
  const rawTransport = readFlag(args, "--transport") ?? env.MCP_TRANSPORT ?? "http";

  if (rawTransport !== "http" && rawTransport !== "stdio") {
    throw new Error(`Unsupported transport: ${rawTransport}`);
  }

  const rawPort = readFlag(args, "--port") ?? env.MCP_PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port)) {
    throw new Error(`Invalid port: ${rawPort}`);
  }

  const allowedOrigins = readCsvFlag(args, "--allowed-origins");
  const envAllowedOrigins = env.MCP_ALLOWED_ORIGINS
    ? parseCsv(env.MCP_ALLOWED_ORIGINS)
    : undefined;
  const allowedHosts = readCsvFlag(args, "--allowed-hosts");
  const envAllowedHosts = env.MCP_ALLOWED_HOSTS
    ? parseCsv(env.MCP_ALLOWED_HOSTS)
    : undefined;

  const resolvedAllowedOrigins = allowedOrigins.length > 0 ? allowedOrigins : (envAllowedOrigins ?? []);
  const resolvedAllowedHosts = allowedHosts.length > 0 ? allowedHosts : (envAllowedHosts ?? []);
  const auth = resolveRuntimeAuthConfig(args, env);

  if (auth.mode === "oauth" && rawTransport !== "http") {
    throw new Error("OAuth deployment modes require HTTP transport.");
  }

  if (auth.mode === "oauth" && auth.deployment === "oauth-hardened" && resolvedAllowedOrigins.length === 0) {
    throw new Error("oauth-hardened deployment requires MCP_ALLOWED_ORIGINS or --allowed-origins.");
  }

  return {
    allowedOrigins: resolvedAllowedOrigins,
    allowedHosts: resolvedAllowedHosts,
    auth,
    transport: rawTransport,
    host: readFlag(args, "--host") ?? env.MCP_HOST ?? "127.0.0.1",
    path: readFlag(args, "--path") ?? env.MCP_PATH ?? "/mcp",
    port,
  };
}

export function resolveAppConfig(args: string[], env: EnvConfig): AppConfig {
  assertBackendEnvironment(env);

  return {
    runtime: resolveRuntimeConfig(args, env),
    ynab: readYnabConfig(env),
  };
}
