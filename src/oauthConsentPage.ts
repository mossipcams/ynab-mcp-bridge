import crypto from "node:crypto";

import type { RequestHandler } from "express";

import type { PendingConsent } from "./oauthCore.js";

export const CONSENT_PATH = "/authorize/consent";

const CONSENT_PAGE_HEADERS = {
  "cache-control": "no-store",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildConsentPageHeaders(scriptNonce: string, formActionSources: string[]) {
  return {
    ...CONSENT_PAGE_HEADERS,
    "content-security-policy": `default-src 'none'; connect-src 'self'; script-src 'nonce-${scriptNonce}'; form-action ${formActionSources.join(" ")}; frame-ancestors 'none'; base-uri 'none'`,
  } as const;
}

export function renderConsentPage(consentChallenge: string, pending: PendingConsent, scriptNonce: string) {
  const clientName = escapeHtml(pending.clientName ?? pending.clientId);
  const resource = escapeHtml(pending.resource);
  const scopes = escapeHtml(pending.scopes.length > 0 ? pending.scopes.join(", ") : "default scopes");
  const escapedConsentChallenge = escapeHtml(consentChallenge);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Approve MCP client access</title>
  </head>
  <body>
    <h1>Approve MCP client access</h1>
    <p><strong>${clientName}</strong> is requesting access to ${resource}.</p>
    <p>Requested scopes: ${scopes}</p>
    <p>After you approve, this window may take a moment to continue.</p>
    <p id="consent-status" hidden>Continuing...</p>
    <form id="approve-form" method="post" action="${CONSENT_PATH}" data-action="approve">
      <input type="hidden" name="action" value="approve">
      <input type="hidden" name="consent_challenge" value="${escapedConsentChallenge}">
      <button id="approve-button" type="submit">Approve</button>
    </form>
    <form id="deny-form" method="post" action="${CONSENT_PATH}" data-action="deny">
      <input type="hidden" name="action" value="deny">
      <input type="hidden" name="consent_challenge" value="${escapedConsentChallenge}">
      <button id="deny-button" type="submit">Deny</button>
    </form>
    <script nonce="${scriptNonce}">
      const forms = document.querySelectorAll("form");
      const status = document.getElementById("consent-status");
      const approveButton = document.getElementById("approve-button");
      const denyButton = document.getElementById("deny-button");

      for (const form of forms) {
        if (!(form instanceof HTMLFormElement)) {
          continue;
        }

        form.addEventListener("submit", (event) => {
          if (document.body.dataset.submitted === "true") {
            event.preventDefault();
            return;
          }

          document.body.dataset.submitted = "true";

          if (approveButton instanceof HTMLButtonElement) {
            approveButton.disabled = true;
          }

          if (denyButton instanceof HTMLButtonElement) {
            denyButton.disabled = true;
          }

          const action = form.dataset.action === "deny" ? "deny" : "approve";

          if (action === "deny") {
            if (denyButton instanceof HTMLButtonElement) {
              denyButton.textContent = "Denying...";
            }
          } else if (approveButton instanceof HTMLButtonElement) {
            approveButton.textContent = "Continuing...";
          }

          if (status instanceof HTMLElement) {
            status.hidden = false;
          }
        });
      }
    </script>
  </body>
</html>`;
}

export function sendConsentPage(
  res: Parameters<RequestHandler>[1],
  consentChallenge: string,
  pending: PendingConsent,
  authorizationUrl: string,
) {
  const scriptNonce = crypto.randomBytes(16).toString("base64url");
  const formActionSources = Array.from(new Set([
    "'self'",
    new URL(pending.redirectUri).origin,
    new URL(authorizationUrl).origin,
  ]));

  for (const [name, value] of Object.entries(buildConsentPageHeaders(scriptNonce, formActionSources))) {
    res.setHeader(name, value);
  }

  res.status(200)
    .type("html")
    .send(renderConsentPage(consentChallenge, pending, scriptNonce));
}
