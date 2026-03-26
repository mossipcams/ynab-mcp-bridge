import { getStringValue, isRecord } from "../typeUtils.js";
import type { DetectedClientProfile } from "./types.js";

const RESOLVED_CLIENT_PROFILE_KEY = "resolvedClientProfile";

type ProfileLocals = Record<string, unknown>;

export function setResolvedClientProfile(locals: ProfileLocals, profile: DetectedClientProfile) {
  locals[RESOLVED_CLIENT_PROFILE_KEY] = profile;
}

export function getResolvedClientProfile(locals: ProfileLocals) {
  const value = locals[RESOLVED_CLIENT_PROFILE_KEY];

  if (!isRecord(value)) {
    return undefined;
  }

  const profileId = getStringValue(value, "profileId");
  const reason = getStringValue(value, "reason");

  if (
    (profileId === "chatgpt" || profileId === "claude" || profileId === "codex" || profileId === "generic")
    && typeof reason === "string"
  ) {
    const detectedProfile: DetectedClientProfile = {
      profileId,
      reason,
    };

    return detectedProfile;
  }

  return undefined;
}
