import { chatgptProfile } from "./chatgptProfile.js";
import { claudeProfile } from "./claudeProfile.js";
import { genericProfile } from "./genericProfile.js";
const profiles = {
    chatgpt: chatgptProfile,
    claude: claudeProfile,
    generic: genericProfile,
};
export function getClientProfile(profileId) {
    return profiles[profileId];
}
