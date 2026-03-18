import type { DetectedClientProfile } from "./types.js";

const RESOLVED_CLIENT_PROFILE_KEY = "resolvedClientProfile";

type ProfileLocals = Record<string, unknown>;

export function setResolvedClientProfile(locals: ProfileLocals, profile: DetectedClientProfile) {
  locals[RESOLVED_CLIENT_PROFILE_KEY] = profile;
}

export function getResolvedClientProfile(locals: ProfileLocals) {
  return locals[RESOLVED_CLIENT_PROFILE_KEY] as DetectedClientProfile | undefined;
}
