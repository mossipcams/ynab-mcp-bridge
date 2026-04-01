export function createFakeProvider() {
    const authorizationCodeExchanges = [];
    const refreshTokenExchanges = [];
    return {
        adapter: {
            buildAuthorizationUrl(input) {
                return `https://id.example.com/oauth/authorize?state=${encodeURIComponent(input.state)}`;
            },
            async exchangeAuthorizationCode(input) {
                authorizationCodeExchanges.push(input.code);
                return {
                    access_token: "provider-access-token",
                    refresh_token: "provider-refresh-token",
                    subject: "user-123",
                    token_type: "Bearer",
                };
            },
            async exchangeRefreshToken(input) {
                refreshTokenExchanges.push(input.refreshToken);
                return {
                    access_token: "provider-access-token-2",
                    refresh_token: "provider-refresh-token-2",
                    subject: "user-123",
                    token_type: "Bearer",
                };
            },
        },
        getCalls() {
            return {
                authorizationCodeExchanges: [...authorizationCodeExchanges],
                refreshTokenExchanges: [...refreshTokenExchanges],
            };
        },
    };
}
