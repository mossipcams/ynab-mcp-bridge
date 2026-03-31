import type { AuthConfig } from "../config/schema.js";
import type { AuthStore } from "../store/authStore.js";

type AuthClientConfig = AuthConfig["clients"][number] | {
  clientId: string;
  displayName?: string;
  providerId: string;
  redirectUri: string;
  scopes: string[];
};

export function findClientConfig(config: AuthConfig, store: AuthStore, clientId: string): AuthClientConfig {
  const registeredClient = store.getRegisteredClient(clientId);

  if (registeredClient) {
    return {
      clientId: registeredClient.clientId,
      ...(registeredClient.clientName ? { displayName: registeredClient.clientName } : {}),
      providerId: registeredClient.providerId,
      redirectUri: registeredClient.redirectUri,
      scopes: registeredClient.scopes,
    };
  }

  const client = config.clients.find((candidate) => candidate.clientId === clientId);

  if (!client) {
    throw new Error(`Unknown OAuth client_id: ${clientId}`);
  }

  return client;
}

export function assertExactRedirectUri(client: AuthClientConfig, requestedRedirectUri: string) {
  if (requestedRedirectUri !== client.redirectUri) {
    throw new Error("redirect_uri does not match the registered client redirect URI.");
  }

  return {
    clientId: client.clientId,
    match: true as const,
    registeredRedirectUri: client.redirectUri,
    requestedRedirectUri,
  };
}
