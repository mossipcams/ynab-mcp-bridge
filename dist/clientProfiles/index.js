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
export function getClientProfile(profileId) {
    return profiles[profileId];
}
