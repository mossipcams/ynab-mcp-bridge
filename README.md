# ynab-mcp-bridge

`ynab-mcp-bridge` is a Model Context Protocol server for YNAB built on the YNAB SDK v4 surface.

It supports:

* stateless authless streamable HTTP by default for self-hosted deployments
* optional OAuth-protected streamable HTTP for remote deployments and MCP clients
* `stdio` transport when explicitly requested for local clients and debugging
* direct JSON responses for HTTP requests without durable MCP sessions

## Requirements

Set these environment variables before starting the server:

* `YNAB_API_TOKEN` required
* `YNAB_PLAN_ID` optional default plan for tools that accept `planId`
* `MCP_TRANSPORT` optional, `stdio` or `http`, default `http`
* `MCP_HOST` optional, HTTP only, default `127.0.0.1`
* `MCP_PORT` optional, HTTP only, default `3000`
* `MCP_PATH` optional, HTTP only, default `/mcp`
* `MCP_ALLOWED_ORIGINS` optional comma-separated allowlist for browser-based HTTP clients like remote MCP hosts
* `MCP_AUTH_MODE` optional, `none` or `oauth`, default `none`
* `MCP_PUBLIC_URL` required in `oauth` mode, the externally reachable MCP URL such as `https://mcp.example.com/mcp`
* `MCP_OAUTH_ISSUER` required in `oauth` mode, the upstream OAuth issuer URL
* `MCP_OAUTH_AUTHORIZATION_URL` required in `oauth` mode, the upstream OAuth authorization endpoint
* `MCP_OAUTH_TOKEN_URL` required in `oauth` mode, the upstream OAuth token endpoint
* `MCP_OAUTH_JWKS_URL` required in `oauth` mode, the upstream JWKS endpoint used to verify fallback Cloudflare Access JWTs
* `MCP_OAUTH_AUDIENCE` required in `oauth` mode, the resource/audience this MCP server expects
* `MCP_OAUTH_CLIENT_ID` required in `oauth` mode, the upstream confidential OAuth client ID used by the MCP bridge
* `MCP_OAUTH_CLIENT_SECRET` required in `oauth` mode, the upstream confidential OAuth client secret used by the MCP bridge
* `MCP_OAUTH_STORE_PATH` required in `oauth` mode, the filesystem path used to persist OAuth broker state across restarts
* `MCP_OAUTH_TOKEN_SIGNING_SECRET` required in `oauth` mode, the stable secret used to sign MCP-issued bearer tokens
* `MCP_OAUTH_CALLBACK_PATH` optional in `oauth` mode, default `/oauth/callback`
* `MCP_OAUTH_SCOPES` optional comma-separated scopes to advertise and require in `oauth` mode

HTTP mode validates the `Origin` header when one is present. Loopback origins are allowed automatically for loopback hosts, but remote/browser deployments should set `MCP_ALLOWED_ORIGINS` explicitly, for example `https://claude.ai`.
The default HTTP transport is stateless: clients should use `POST /mcp` requests directly and should not rely on returned `Mcp-Session-Id` headers, session-scoped `GET` streams, or `DELETE` session teardown.
In `oauth` mode the server acts as the MCP authorization server for clients such as Claude Web. It exposes local `/.well-known/oauth-authorization-server`, `/register`, `/authorize`, `/token`, and `/.well-known/oauth-protected-resource/mcp` endpoints, requires an MCP-side consent step before redirecting upstream, brokers the upstream authorization-code and refresh-token exchanges, and enforces broker-issued bearer tokens on `POST /mcp`. If Cloudflare Access injects `Cf-Access-Jwt-Assertion`, the server will still bridge that header into the MCP request path as an explicit compatibility mode.

If `YNAB_PLAN_ID` is not set, the bridge automatically resolves YNAB's `default_plan` when one exists or the only available plan when there is exactly one. If a configured plan becomes stale, the bridge retries once with a fresh plan resolution.
OAuth here protects access to a shared backend YNAB token configured through `YNAB_API_TOKEN`; it does not yet perform per-user YNAB OAuth delegation.

## Available MCP Tools

The server exposes a read-only plan-based toolset:

* `ynab_get_user`
* `ynab_list_plans`
* `ynab_get_plan`
* `ynab_get_plan_settings`
* `ynab_get_plan_month`
* `ynab_list_plan_months`
* `ynab_get_mcp_version`
* `ynab_list_transactions`
* `ynab_get_transaction`
* `ynab_get_transactions_by_account`
* `ynab_get_transactions_by_category`
* `ynab_get_transactions_by_payee`
* `ynab_list_categories`
* `ynab_get_category`
* `ynab_get_month_category`
* `ynab_get_transactions_by_month`
* `ynab_list_scheduled_transactions`
* `ynab_get_scheduled_transaction`
* `ynab_list_accounts`
* `ynab_get_account`
* `ynab_list_payees`
* `ynab_get_payee`
* `ynab_list_payee_locations`
* `ynab_get_payee_location`
* `ynab_get_payee_locations_by_payee`
* `ynab_get_money_movements`
* `ynab_get_money_movements_by_month`
* `ynab_get_money_movement_groups`
* `ynab_get_money_movement_groups_by_month`
* `ynab_get_financial_snapshot`
* `ynab_get_spending_summary`
* `ynab_get_cash_flow_summary`
* `ynab_get_budget_health_summary`
* `ynab_get_upcoming_obligations`
* `ynab_get_goal_progress_summary`
* `ynab_get_budget_cleanup_summary`
* `ynab_get_income_summary`
* `ynab_get_category_trend_summary`
* `ynab_get_70_20_10_summary`

## Rate Limiting

YNAB documents a limit of 200 requests per rolling hour per access token. The bridge now applies a shared per-token sliding-window limiter in the YNAB client layer and retries `429 Too Many Requests` responses conservatively.

## Quick Start

```bash
npm install
npm run build
npm start
```

To start HTTP mode explicitly:

```bash
MCP_TRANSPORT=http npm run start:http
```

To expose HTTP mode to a remote MCP client, bind an external host intentionally and allow the client origin explicitly:

```bash
MCP_TRANSPORT=http \
MCP_HOST=0.0.0.0 \
MCP_ALLOWED_ORIGINS=https://claude.ai \
npm run start:http
```

This stateless HTTP default is intended to be more tolerant of Claude Desktop's remote MCP lifecycle, where tool calls may arrive without a durable MCP session continuation.

To enable OAuth for a remote deployment:

```bash
MCP_TRANSPORT=http \
MCP_HOST=0.0.0.0 \
MCP_ALLOWED_ORIGINS=https://claude.ai \
MCP_AUTH_MODE=oauth \
MCP_PUBLIC_URL=https://mcp.example.com/mcp \
MCP_OAUTH_ISSUER=https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123 \
MCP_OAUTH_AUTHORIZATION_URL=https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization \
MCP_OAUTH_TOKEN_URL=https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token \
MCP_OAUTH_JWKS_URL=https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks \
MCP_OAUTH_AUDIENCE=https://mcp.example.com/mcp \
MCP_OAUTH_CLIENT_ID=cloudflare-access-client-id \
MCP_OAUTH_CLIENT_SECRET=cloudflare-access-client-secret \
MCP_OAUTH_STORE_PATH=/var/lib/ynab-mcp-bridge/oauth-store.json \
MCP_OAUTH_TOKEN_SIGNING_SECRET=replace-with-a-long-random-secret \
MCP_OAUTH_SCOPES=openid,profile \
npm run start:http
```

## Cloudflare Access

For Cloudflare Access, use the public MCP URL for both `MCP_PUBLIC_URL` and `MCP_OAUTH_AUDIENCE` unless your Access app is configured with a different audience/resource identifier.
Use the per-application OIDC SaaS endpoints under `/cdn-cgi/access/sso/oidc/<client-id>` for `MCP_OAUTH_ISSUER`, `MCP_OAUTH_AUTHORIZATION_URL`, `MCP_OAUTH_TOKEN_URL`, and `MCP_OAUTH_JWKS_URL`.
Set `MCP_OAUTH_CLIENT_ID` and `MCP_OAUTH_CLIENT_SECRET` to the confidential client credentials for the upstream Access application, and make sure the Access application allows the bridge callback URL built from `MCP_PUBLIC_URL` and `MCP_OAUTH_CALLBACK_PATH` such as `https://mcp.example.com/oauth/callback`.
Set `MCP_OAUTH_STORE_PATH` to durable storage that survives restarts, and set `MCP_OAUTH_TOKEN_SIGNING_SECRET` to a stable secret value so broker-issued MCP tokens remain valid across process restarts.
The bridge advertises itself as the MCP authorization server from `/.well-known/oauth-authorization-server`, dynamically registers MCP clients at `/register`, presents an MCP-side consent step at `/authorize`, exchanges the upstream code at the callback URL, refreshes the upstream grant when Claude refreshes, and issues MCP bearer tokens from `/token`.
Do not use the older tenant-wide `/cdn-cgi/access/sso/oauth2/*` or `/cdn-cgi/access/certs` endpoints here. With current MCP clients, that legacy configuration can break the authorization-code redirect and surface errors like `code: Field required`.
When deployed behind Cloudflare, keep `MCP_PUBLIC_URL` on the external HTTPS hostname even if the local bind address is `127.0.0.1` or `0.0.0.0`; discovery metadata must describe the public URL, not the internal listener.

## CLI Usage

Start over stdio:

```bash
node dist/index.js --transport stdio
```

Start over HTTP explicitly:

```bash
node dist/index.js --transport http --host 127.0.0.1 --port 3000 --path /mcp
```

Start with the default HTTP configuration:

```bash
node dist/index.js
```

Allow specific browser origins over HTTP:

```bash
node dist/index.js --transport http --host 0.0.0.0 --port 3000 --path /mcp --allowed-origins https://claude.ai,https://chat.openai.com
```

Enable OAuth over HTTP:

```bash
node dist/index.js \
  --transport http \
  --host 0.0.0.0 \
  --port 3000 \
  --path /mcp \
  --allowed-origins https://claude.ai \
  --auth-mode oauth \
  --public-url https://mcp.example.com/mcp \
  --oauth-issuer https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123 \
  --oauth-authorization-url https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization \
  --oauth-token-url https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token \
  --oauth-jwks-url https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks \
  --oauth-audience https://mcp.example.com/mcp \
  --oauth-client-id cloudflare-access-client-id \
  --oauth-client-secret cloudflare-access-client-secret \
  --oauth-store-path /var/lib/ynab-mcp-bridge/oauth-store.json \
  --oauth-token-signing-secret replace-with-a-long-random-secret \
  --oauth-scopes openid,profile
```

## Development

```bash
npm test
npm run build
```
