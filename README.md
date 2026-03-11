# ynab-mcp-bridge

`ynab-mcp-bridge` is a Model Context Protocol server for YNAB built on the YNAB SDK v4 surface.

It supports:

* `stdio` transport for local clients and debugging
* authless streamable HTTP for self-hosted deployments
* HTTP session termination via `DELETE` for clean client resets
* standards-based OAuth protected-resource metadata for remote client probing

## Requirements

Set these environment variables before starting the server:

* `YNAB_API_TOKEN` required
* `YNAB_PLAN_ID` optional default plan for tools that accept `planId`
* `MCP_TRANSPORT` optional, `stdio` or `http`, default `stdio`
* `MCP_HOST` optional, HTTP only, default `127.0.0.1`
* `MCP_PORT` optional, HTTP only, default `3000`
* `MCP_PATH` optional, HTTP only, default `/mcp`
* `MCP_ALLOWED_ORIGINS` optional comma-separated allowlist for browser-based HTTP clients like remote MCP hosts

HTTP mode validates the `Origin` header when one is present. Loopback origins are allowed automatically for loopback hosts, but remote/browser deployments should set `MCP_ALLOWED_ORIGINS` explicitly, for example `https://claude.ai`.

If `YNAB_PLAN_ID` is not set, the bridge automatically resolves YNAB's `default_plan` when one exists or the only available plan when there is exactly one. If a configured plan becomes stale, the bridge retries once with a fresh plan resolution.

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

## Rate Limiting

YNAB documents a limit of 200 requests per rolling hour per access token. The bridge now applies a shared per-token sliding-window limiter in the YNAB client layer and retries `429 Too Many Requests` responses conservatively.

## Quick Start

```bash
npm install
npm run build
npm run start:stdio
```

To start HTTP mode:

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

## CLI Usage

Start over stdio:

```bash
node dist/index.js --transport stdio
```

Start over HTTP:

```bash
node dist/index.js --transport http --host 127.0.0.1 --port 3000 --path /mcp
```

Allow specific browser origins over HTTP:

```bash
node dist/index.js --transport http --host 0.0.0.0 --port 3000 --path /mcp --allowed-origins https://claude.ai,https://chat.openai.com
```

## Development

```bash
npm test
npm run build
```
