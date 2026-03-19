import { genericProfile } from "./genericProfile.js";
import type { ClientProfile } from "./types.js";

export const chatgptProfile: ClientProfile = {
  ...genericProfile,
  id: "chatgpt",
  matchesInitialize: (clientInfo) => {
    const name = typeof (clientInfo as { name?: unknown } | undefined)?.name === "string"
      ? (clientInfo as { name: string }).name.toLowerCase()
      : undefined;

    return Boolean(name && (name.includes("chatgpt") || name.includes("openai-mcp")));
  },
  oauth: {
    ...genericProfile.oauth,
    discoveryPathVariants: [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
    ],
    tolerateExtraDiscoveryProbes: true,
  },
};
