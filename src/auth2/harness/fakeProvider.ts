export function createFakeProvider() {
  const authorizationCodeExchanges: string[] = [];
  const refreshTokenExchanges: string[] = [];

  return {
    adapter: {
      buildAuthorizationUrl(input: {
        state: string;
      }) {
        return `https://id.example.com/oauth/authorize?state=${encodeURIComponent(input.state)}`;
      },
      async exchangeAuthorizationCode(input: {
        code: string;
      }) {
        authorizationCodeExchanges.push(input.code);
        return {
          access_token: "provider-access-token",
          refresh_token: "provider-refresh-token",
          subject: "user-123",
          token_type: "Bearer",
        };
      },
      async exchangeRefreshToken(input: {
        refreshToken: string;
      }) {
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
