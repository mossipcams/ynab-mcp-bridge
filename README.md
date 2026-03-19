# ynab-mcp-bridge

`ynab-mcp-bridge` is a read-only Model Context Protocol (MCP) server for YNAB.

It gives MCP clients a shared YNAB backend over either:

- stateless HTTP for self-hosted or remote deployments
- optional OAuth-protected HTTP for remote browser-based MCP clients
- `stdio` for local desktop clients and debugging

## What You Get

- Read-only YNAB tools for plans, accounts, categories, payees, transactions, scheduled transactions, and summary views
- HTTP mode by default
- Stateless `POST /mcp` handling that works well with clients that do not keep durable MCP sessions
- Optional OAuth broker mode for remote clients such as Claude Web
- Automatic plan resolution when `YNAB_PLAN_ID` is not set

## Choose A Mode

| Mode | Use it when | Auth | Key settings |
| --- | --- | --- | --- |
| `http` + `authless` | Local use or a trusted self-hosted setup | None | `YNAB_API_TOKEN` |
| `http` + `oauth-single-tenant` | Remote client access behind an upstream IdP | MCP-side OAuth | `MCP_PUBLIC_URL` and OAuth settings |
| `http` + `oauth-hardened` | Same as above, but fail closed unless origins are explicitly allowed | MCP-side OAuth | OAuth settings plus `MCP_ALLOWED_ORIGINS` |
| `stdio` | Local desktop clients and debugging | None | `YNAB_API_TOKEN` |

`authless` is the default deployment mode. `http` is the default transport.

## Quick Start

### 1. Install and build

```bash
npm install
npm run build
```

### 2. Run the default local HTTP server

```bash
export YNAB_API_TOKEN=your-token
npm start
```

Defaults:

- host: `127.0.0.1`
- port: `3000`
- path: `/mcp`

### 3. Run over `stdio`

```bash
export YNAB_API_TOKEN=your-token
npm run start:stdio
```

### 4. Expose authless HTTP intentionally

Use this only when the network path is already trusted.

```bash
MCP_TRANSPORT=http \
MCP_HOST=0.0.0.0 \
MCP_ALLOWED_ORIGINS=https://claude.ai \
YNAB_API_TOKEN=your-token \
npm run start:http
```

### 5. Enable OAuth for a remote client

This is the recommended remote setup.

```bash
MCP_TRANSPORT=http \
MCP_HOST=0.0.0.0 \
MCP_ALLOWED_ORIGINS=https://claude.ai \
MCP_DEPLOYMENT_MODE=oauth-single-tenant \
MCP_PUBLIC_URL=https://mcp.example.com/mcp \
MCP_OAUTH_CLOUDFLARE_DOMAIN=example.cloudflareaccess.com \
MCP_OAUTH_CLIENT_ID=cloudflare-access-client-id \
MCP_OAUTH_CLIENT_SECRET=cloudflare-access-client-secret \
MCP_OAUTH_SCOPES=openid,profile \
YNAB_API_TOKEN=your-token \
npm run start:http
```

## Environment Variables

### YNAB Backend

| Variable | Required | Notes |
| --- | --- | --- |
| `YNAB_API_TOKEN` | Yes | Shared backend YNAB token |
| `YNAB_PLAN_ID` | No | Default plan for tools that accept `planId` |

If `YNAB_PLAN_ID` is unset, the bridge tries YNAB's `default_plan` first, then the only available plan when exactly one exists. If a configured plan becomes stale, the bridge retries once with a fresh resolution.

### Transport and HTTP

| Variable | Default | Notes |
| --- | --- | --- |
| `MCP_TRANSPORT` | `http` | `http` or `stdio` |
| `MCP_HOST` | `127.0.0.1` | HTTP only |
| `MCP_PORT` | `3000` | HTTP only |
| `MCP_PATH` | `/mcp` | HTTP only |
| `MCP_ALLOWED_ORIGINS` | empty | Comma-separated browser origin allowlist |
| `MCP_ALLOWED_HOSTS` | empty | Optional comma-separated `Host` header allowlist |
| `MCP_DEPLOYMENT_MODE` | `authless` | `authless`, `oauth-single-tenant`, or `oauth-hardened` |
| `MCP_AUTH_MODE` | none | Legacy compatibility shim: `none` or `oauth` |

Notes:

- When an `Origin` header is present, HTTP mode validates it.
- Loopback origins are allowed automatically for loopback hosts.
- `oauth-hardened` refuses to start without `MCP_ALLOWED_ORIGINS`.

### OAuth

| Variable | Required | Notes |
| --- | --- | --- |
| `MCP_PUBLIC_URL` | Yes in OAuth modes | Public MCP URL, for example `https://mcp.example.com/mcp` |
| `MCP_OAUTH_CLOUDFLARE_DOMAIN` | Optional | Shortcut for Cloudflare Access endpoint derivation |
| `MCP_OAUTH_ISSUER` | Yes unless Cloudflare shortcut is used | Upstream issuer |
| `MCP_OAUTH_AUTHORIZATION_URL` | Yes unless Cloudflare shortcut is used | Upstream authorization endpoint |
| `MCP_OAUTH_TOKEN_URL` | Yes unless Cloudflare shortcut is used | Upstream token endpoint |
| `MCP_OAUTH_JWKS_URL` | Yes unless Cloudflare shortcut is used | Upstream JWKS endpoint |
| `MCP_OAUTH_AUDIENCE` | No | Defaults to `MCP_PUBLIC_URL` |
| `MCP_OAUTH_CLIENT_ID` | Yes in OAuth modes | Upstream confidential client ID |
| `MCP_OAUTH_CLIENT_SECRET` | Yes in OAuth modes | Upstream confidential client secret |
| `MCP_OAUTH_STORE_PATH` | No | Defaults to `~/.ynab-mcp-bridge/oauth-store.json` |
| `MCP_OAUTH_TOKEN_SIGNING_SECRET` | No | Defaults to a stable derived secret |
| `MCP_OAUTH_CALLBACK_PATH` | No | Defaults to `/oauth/callback` |
| `MCP_OAUTH_SCOPES` | No | Comma-separated scopes to advertise and require |

## How HTTP Mode Behaves

- The default HTTP transport is stateless. Clients should send `POST /mcp` and should not depend on durable MCP sessions.
- The bridge still exposes `Mcp-Session-Id` headers for compatibility, but session continuity is not the primary path.
- In OAuth modes, the bridge acts as the MCP authorization server and exposes:
  - `/.well-known/oauth-authorization-server`
  - `/register`
  - `/authorize`
  - `/token`
  - `/.well-known/oauth-protected-resource/mcp`
- OAuth here protects access to a shared backend YNAB token. It does not do per-user YNAB OAuth delegation.

## Cloudflare Access

For Cloudflare Access, the simplest setup is:

- `MCP_PUBLIC_URL`
- `MCP_OAUTH_CLOUDFLARE_DOMAIN`
- `MCP_OAUTH_CLIENT_ID`
- `MCP_OAUTH_CLIENT_SECRET`

The bridge will derive the per-application OIDC SaaS endpoints under `/cdn-cgi/access/sso/oidc/<client-id>`.

Important details:

- Register the callback built from `MCP_PUBLIC_URL` and `MCP_OAUTH_CALLBACK_PATH`, for example `https://mcp.example.com/oauth/callback`
- Keep `MCP_PUBLIC_URL` on the external HTTPS hostname, not the internal bind address
- Use the public MCP URL as the audience unless your Access app expects a different resource identifier
- Do not use the older tenant-wide `/cdn-cgi/access/sso/oauth2/*` endpoints for this flow

If Cloudflare injects `Cf-Access-Jwt-Assertion`, the bridge can translate that assertion into a bridge-local token as an explicit compatibility path.

## Tool Coverage

The server exposes a read-only YNAB toolset across:

- user and plan metadata
- plan settings and plan months
- accounts, categories, and payees
- transactions and scheduled transactions
- payee locations
- money movement and transfer summaries
- higher-level financial summaries such as spending, cash flow, income, goal progress, obligations, and budget health

## CLI Examples

Start with the default HTTP settings:

```bash
node dist/index.js
```

Start over `stdio`:

```bash
node dist/index.js --transport stdio
```

Start over HTTP explicitly:

```bash
node dist/index.js --transport http --host 127.0.0.1 --port 3000 --path /mcp
```

Allow specific browser origins:

```bash
node dist/index.js \
  --transport http \
  --host 0.0.0.0 \
  --port 3000 \
  --path /mcp \
  --allowed-origins https://claude.ai,https://chat.openai.com
```

Lock down accepted host headers too:

```bash
node dist/index.js \
  --transport http \
  --host 0.0.0.0 \
  --port 3000 \
  --path /mcp \
  --allowed-origins https://claude.ai \
  --allowed-hosts mcp.example.com
```

Enable OAuth with explicit upstream endpoints:

```bash
node dist/index.js \
  --transport http \
  --host 0.0.0.0 \
  --port 3000 \
  --path /mcp \
  --allowed-origins https://claude.ai \
  --deployment-mode oauth-single-tenant \
  --public-url https://mcp.example.com/mcp \
  --oauth-issuer https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123 \
  --oauth-authorization-url https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/authorization \
  --oauth-token-url https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/token \
  --oauth-jwks-url https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client-123/jwks \
  --oauth-client-id cloudflare-access-client-id \
  --oauth-client-secret cloudflare-access-client-secret \
  --oauth-audience https://mcp.example.com/mcp \
  --oauth-store-path /var/lib/ynab-mcp-bridge/oauth-store.json \
  --oauth-token-signing-secret replace-with-a-long-random-secret \
  --oauth-scopes openid,profile
```

For a stricter remote deployment, switch `oauth-single-tenant` to `oauth-hardened`.

## Docker

Build the image:

```bash
docker build -t ynab-mcp-bridge .
```

Run the default HTTP server:

```bash
docker run --rm \
  -p 3000:3000 \
  -e YNAB_API_TOKEN=your-token \
  ynab-mcp-bridge
```

## Rate Limiting

YNAB documents a limit of 200 requests per rolling hour per access token. The bridge applies a shared per-token sliding-window limiter and retries `429 Too Many Requests` responses conservatively.

## Development

```bash
npm test
npm run build
```
