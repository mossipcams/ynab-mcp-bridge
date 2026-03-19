import { chatgptProfile } from "./chatgptProfile.js";
import { claudeProfile } from "./claudeProfile.js";
import { codexProfile } from "./codexProfile.js";
import { genericProfile } from "./genericProfile.js";
const profiles = {
    chatgpt: chatgptProfile,
    claude: claudeProfile,
    codex: codexProfile,
    generic: genericProfile,
};
const preAuthDetectionOrder = [
    "claude",
    "chatgpt",
    "codex",
];
export function getClientProfile(profileId) {
    return profiles[profileId];
}
export function getPreAuthDetectionProfiles() {
    return preAuthDetectionOrder.map((profileId) => profiles[profileId]);
}
export function getInitializeDetectionProfiles() {
    return preAuthDetectionOrder.map((profileId) => profiles[profileId]);
}
