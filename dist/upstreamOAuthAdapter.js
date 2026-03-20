import { ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { getStringValue, isRecord } from "./typeUtils.js";
class UpstreamTokenExchangeError extends ServerError {
    upstreamError;
    upstreamErrorDescription;
    upstreamErrorFields;
    upstreamStatus;
    constructor(message, details) {
        super(message);
        this.name = "ServerError";
        this.upstreamError = details.upstreamError;
        this.upstreamErrorDescription = details.upstreamErrorDescription;
        this.upstreamErrorFields = details.upstreamErrorFields;
        this.upstreamStatus = details.upstreamStatus;
    }
}
function summarizeUpstreamTokenError(bodyText, status) {
    const details = {
        upstreamStatus: status,
    };
    if (!bodyText.trim()) {
        return details;
    }
    try {
        const parsed = JSON.parse(bodyText);
        if (!isRecord(parsed)) {
            return details;
        }
        const error = getStringValue(parsed, "error");
        const errorDescription = getStringValue(parsed, "error_description");
        const errorFields = [
            ...(error ? ["error"] : []),
            ...(errorDescription ? ["error_description"] : []),
        ];
        return {
            ...details,
            ...(error ? { upstreamError: error } : {}),
            ...(errorDescription ? { upstreamErrorDescription: errorDescription } : {}),
            ...(errorFields.length > 0 ? { upstreamErrorFields: errorFields } : {}),
        };
    }
    catch {
        return details;
    }
}
function isOAuthTokens(value) {
    return isRecord(value) && typeof value["access_token"] === "string";
}
async function exchangeTokens(url, body, failureMessage) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });
    if (!response.ok) {
        const bodyText = await response.text();
        throw new UpstreamTokenExchangeError(`${failureMessage} with status ${response.status}.`, summarizeUpstreamTokenError(bodyText, response.status));
    }
    const tokens = await response.json();
    if (!isOAuthTokens(tokens)) {
        throw new ServerError("Upstream token exchange returned an invalid token payload.");
    }
    return tokens;
}
export function createUpstreamOAuthAdapter(options) {
    return {
        buildAuthorizationUrl(record) {
            const url = new URL(options.authorizationUrl);
            url.searchParams.set("client_id", options.clientId);
            url.searchParams.set("redirect_uri", options.callbackUrl);
            url.searchParams.set("response_type", "code");
            url.searchParams.set("state", record.upstreamState);
            if (record.scopes.length > 0) {
                url.searchParams.set("scope", record.scopes.join(" "));
            }
            url.searchParams.set("resource", record.resource);
            return url;
        },
        async exchangeAuthorizationCode(code) {
            return await exchangeTokens(options.tokenUrl, new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: options.clientId,
                client_secret: options.clientSecret,
                redirect_uri: options.callbackUrl,
            }), "Upstream token exchange failed");
        },
        async exchangeRefreshToken(refreshToken) {
            return await exchangeTokens(options.tokenUrl, new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: options.clientId,
                client_secret: options.clientSecret,
            }), "Upstream refresh exchange failed");
        },
    };
}
