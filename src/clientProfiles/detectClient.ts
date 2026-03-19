import type { DetectedClientProfile, RequestContext } from "./types.js";

const CHATGPT_DISCOVERY_PATHS = new Set([
  "/.well-known/oauth-protected-resource",
]);

const CODEX_DISCOVERY_PATHS = new Set([
  "/.well-known/oauth-authorization-server/sse",
  "/sse/.well-known/oauth-authorization-server",
]);

function getFirstHeaderValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.split(",")[0]?.trim();
  }

  return value?.[0]?.split(",")[0]?.trim();
}

export function detectClientProfile(context: RequestContext): DetectedClientProfile {
  const origin = getFirstHeaderValue(context.headers.origin)?.toLowerCase();

  if (origin === "https://claude.ai") {
    return {
      profileId: "claude",
      reason: "origin:claude.ai",
    };
  }

  if (CHATGPT_DISCOVERY_PATHS.has(context.path)) {
    return {
      profileId: "chatgpt",
      reason: "path:chatgpt-protected-resource-probe",
    };
  }

  if (CODEX_DISCOVERY_PATHS.has(context.path)) {
    return {
      profileId: "codex",
      reason: "path:codex-oauth-probe",
    };
  }

  return {
    profileId: "generic",
    reason: "fallback:generic",
  };
}

function getClientInfoName(clientInfo: unknown) {
  if (!clientInfo || typeof clientInfo !== "object") {
    return undefined;
  }

  const name = (clientInfo as { name?: unknown }).name;
  return typeof name === "string" ? name.toLowerCase() : undefined;
}

export function detectInitializeClientProfile(input: {
  capabilities: unknown;
  clientInfo: unknown;
}): DetectedClientProfile | undefined {
  const clientName = getClientInfoName(input.clientInfo);

  if (!clientName) {
    return undefined;
  }

  if (clientName.includes("chatgpt") || clientName.includes("openai-mcp")) {
    return {
      profileId: "chatgpt",
      reason: "initialize:client-info",
    };
  }

  if (clientName.includes("codex")) {
    return {
      profileId: "codex",
      reason: "initialize:client-info",
    };
  }

  if (clientName.includes("claude")) {
    return {
      profileId: "claude",
      reason: "initialize:client-info",
    };
  }

  return undefined;
}

export function reconcileClientProfile(
  provisionalProfile: DetectedClientProfile,
  confirmedProfile: DetectedClientProfile | undefined,
) {
  if (!confirmedProfile) {
    return {
      mismatch: false,
      profile: provisionalProfile,
    };
  }

  if (provisionalProfile.profileId === "generic") {
    return {
      mismatch: false,
      profile: confirmedProfile,
    };
  }

  if (confirmedProfile.profileId === provisionalProfile.profileId) {
    return {
      mismatch: false,
      profile: confirmedProfile,
    };
  }

  return {
    mismatch: true,
    profile: {
      profileId: "generic" as const,
      reason: "reconciled:generic",
    },
  };
}
