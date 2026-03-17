import { describe, expect, it } from "vitest";

import { CONSENT_PATH, buildConsentPageHeaders, escapeHtml, renderConsentPage } from "./oauthConsentPage.js";

describe("oauthConsentPage", () => {
  it("exports CONSENT_PATH as /authorize/consent", () => {
    expect(CONSENT_PATH).toBe("/authorize/consent");
  });

  it("escapes HTML special characters", () => {
    expect(escapeHtml("<script>alert('boom')</script>")).toBe(
      "&lt;script&gt;alert(&#39;boom&#39;)&lt;/script&gt;",
    );
  });

  it("builds consent page headers with CSP nonce and form-action sources", () => {
    const headers = buildConsentPageHeaders("test-nonce", ["'self'", "https://example.com"]);
    expect(headers["cache-control"]).toBe("no-store");
    expect(headers["content-security-policy"]).toContain("script-src 'nonce-test-nonce'");
    expect(headers["content-security-policy"]).toContain("form-action 'self' https://example.com");
  });

  it("renders consent HTML with escaped values and CONSENT_PATH as form action", () => {
    const html = renderConsentPage("challenge-123", {
      clientId: "client-1",
      clientName: "Test <Client>",
      codeChallenge: "code-challenge",
      expiresAt: Date.now() + 60000,
      redirectUri: "https://example.com/callback",
      resource: "https://api.example.com",
      scopes: ["openid", "profile"],
    }, "nonce-abc");
    expect(html).toContain("Test &lt;Client&gt;");
    expect(html).toContain(`action="${CONSENT_PATH}"`);
    expect(html).toContain('value="challenge-123"');
    expect(html).not.toContain("Test <Client>");
  });
});
