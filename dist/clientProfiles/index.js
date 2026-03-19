import { claudeProfile } from "./claudeProfile.js";
import { codexProfile } from "./codexProfile.js";
import { genericProfile } from "./genericProfile.js";
const profiles = {
    claude: claudeProfile,
    codex: codexProfile,
    generic: genericProfile,
};
export function getClientProfile(profileId) {
    return profiles[profileId];
}
