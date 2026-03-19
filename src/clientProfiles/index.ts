import { chatgptProfile } from "./chatgptProfile.js";
import { claudeProfile } from "./claudeProfile.js";
import { codexProfile } from "./codexProfile.js";
import { genericProfile } from "./genericProfile.js";
import type { ClientProfile, ClientProfileId } from "./types.js";

const profiles: Record<ClientProfileId, ClientProfile> = {
  chatgpt: chatgptProfile,
  claude: claudeProfile,
  codex: codexProfile,
  generic: genericProfile,
};

export function getClientProfile(profileId: ClientProfileId) {
  return profiles[profileId];
}
