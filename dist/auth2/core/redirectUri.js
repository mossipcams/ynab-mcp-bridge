export function findClientConfig(config, store, clientId) {
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
export function assertExactRedirectUri(client, requestedRedirectUri) {
    if (requestedRedirectUri !== client.redirectUri) {
        throw new Error("redirect_uri does not match the registered client redirect URI.");
    }
    return {
        clientId: client.clientId,
        match: true,
        registeredRedirectUri: client.redirectUri,
        requestedRedirectUri,
    };
}
