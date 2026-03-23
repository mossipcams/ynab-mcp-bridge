import { getInitializeDetectionProfiles, getPreAuthDetectionProfiles } from "./index.js";
export function detectClientProfile(context) {
    for (const profile of getPreAuthDetectionProfiles()) {
        if (profile.matchesPreAuth(context)) {
            return {
                profileId: profile.id,
                reason: profile.detection?.getPreAuthReason?.(context) ??
                    profile.detection?.preAuthReason ??
                    `profile:${profile.id}`,
            };
        }
    }
    return {
        profileId: "generic",
        reason: "fallback:generic",
    };
}
export function detectInitializeClientProfile(input) {
    for (const profile of getInitializeDetectionProfiles()) {
        if (profile.matchesInitialize(input.clientInfo, input.capabilities)) {
            return {
                profileId: profile.id,
                reason: profile.detection?.initializeReason ?? "initialize:client-info",
            };
        }
    }
    return undefined;
}
export function reconcileClientProfile(provisionalProfile, confirmedProfile) {
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
            profileId: "generic",
            reason: "reconciled:generic",
        },
    };
}
