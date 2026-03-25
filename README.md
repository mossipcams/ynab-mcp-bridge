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

Build artifact policy:

- `dist/` remains tracked in this repository for now because the published package and CLI entrypoints resolve from built JavaScript under `dist/`.
- When a source change affects runtime output, keep the generated `dist/` artifacts in sync with the source change rather than treating them as disposable local-only files.

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

### Local CI Preflight

Run this before pushing when you want one command that mirrors the required CI gates:

```bash
npm run preflight
```

`preflight` runs the required local checks from CI: `test:ci`, `test:coverage`, `lint:deps`, `lint`, `typecheck`, `lint:unused`, and `build`. It intentionally does not include the advisory-only `lint:oxlint` step because that CI job is non-blocking.

For advisory quality reporting outside the blocking preflight gate, you can also run:

```bash
npm run lint:duplicates
npm run tech-debt:report
```

`lint:duplicates` runs JSCPD across the whole codebase using the checked-in `.jscpd.json` settings and explicit exclusions for generated or non-code paths. `tech-debt:report` uses the same repo-owned code boundary and prints the current duplication, dead-export, suppression, debt-marker, and dependency-update counts.

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

For YNAB-style summaries, treat `assigned_vs_spent` as a timing and buffering signal, not a score for budget discipline. In buffered budgets it often reflects paycheck timing, category staging, or money reserved for future months rather than overspending or underspending by itself.

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

Run the local HTTP reliability probe:

```bash
npm run reliability:http -- --requests 10 --concurrency 2
```

The reliability command uses a bounded authless HTTP scenario that:

- starts a local bridge unless you pass `--url`
- runs `initialize`, `tools/list`, and `ynab_get_mcp_version`
- prints attempts, failures, error rate, and latency percentiles
- exits non-zero when the error rate is above `--max-error-rate`

Useful flags:

- `--requests <n>`: number of reliability sequences to run. Each sequence performs three MCP operations.
- `--concurrency <n>`: number of sequences to run in parallel.
- `--max-error-rate <0..1>`: fail the run if the observed error rate exceeds this threshold.
- `--url <http-url>`: target an already running bridge instead of starting a local one.
- `--host`, `--port`, `--path`: override the local server bind address when `--url` is not used.

Write a machine-readable smoke artifact and compare against a prior run:

```bash
npm run reliability:http -- \
  --requests 10 \
  --concurrency 2 \
  --json-out artifacts/reliability/smoke.json \
  --baseline-artifact artifacts/reliability/baseline-smoke.json
```

Run the heavier reliability suite in dry-run mode:

```bash
npm run reliability:load -- \
  --profile baseline \
  --url http://127.0.0.1:3000/mcp \
  --json-out artifacts/reliability/baseline.json \
  --dry-run
```

The dedicated load suite is designed for named profiles instead of ad hoc request counts:

- `smoke`: fast local regression check using the built-in Node probe
- `baseline`: repeatable average-load run for comparisons
- `stress`: higher sustained load to expose overload behavior
- `spike`: sudden burst behavior
- `soak`: longer steady-state run to catch degradation over time

Recommended workflow:

- run `smoke` on local changes
- record `baseline` artifacts on a stable environment
- run `stress` and `spike` before higher-risk releases
- run `soak` on a scheduled cadence or before major rollout events

Thresholds should be evaluated with error rate and latency percentiles such as `p95` and `p99`, not averages alone. The smoke command and artifact comparison flow already follow that model, and the load-suite dry run prints the exact thresholds that would be enforced by the heavier external runner.

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
npm run lint:duplicates
npm run tech-debt:report
```

`lint:duplicates` runs a JSCPD baseline for whole-codebase duplication. It covers maintained repo code, specs, contracts, Markdown, scripts, and tasks, and excludes only generated/vendor paths such as `.git`, `node_modules`, `dist`, `artifacts`, and `package-lock.json`.
`tech-debt:report` prints the current whole-codebase duplicate-remediation baseline together with dead-export and suppression counts so local cleanup work has one repeatable snapshot command.
