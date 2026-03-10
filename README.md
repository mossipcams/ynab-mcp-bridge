# ynab-mcp-bridge

`ynab-mcp-bridge` is a Model Context Protocol server for YNAB built on the YNAB SDK v4 surface.

It supports:

* `stdio` transport for local clients and debugging
* authless streamable HTTP for self-hosted deployments

## Requirements

Set these environment variables before starting the server:

* `YNAB_API_TOKEN` required
* `YNAB_PLAN_ID` optional default plan for tools that accept `planId`
* `MCP_TRANSPORT` optional, `stdio` or `http`, default `stdio`
* `MCP_HOST` optional, HTTP only, default `0.0.0.0`
* `MCP_PORT` optional, HTTP only, default `3000`
* `MCP_PATH` optional, HTTP only, default `/mcp`

## Available MCP Tools

The server exposes a read-only plan-based toolset:

* `ynab_list_plans`
* `ynab_get_plan`
* `ynab_get_plan_settings`
* `ynab_get_plan_month`
* `ynab_list_categories`
* `ynab_get_category`
* `ynab_get_month_category`
* `ynab_get_transactions_by_month`
* `ynab_get_account`
* `ynab_get_payee`
* `ynab_get_money_movements_by_month`
* `ynab_get_money_movement_groups_by_month`

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

## CLI Usage

Start over stdio:

```bash
node dist/index.js --transport stdio
```

Start over HTTP:

```bash
node dist/index.js --transport http --host 0.0.0.0 --port 3000 --path /mcp
```

## Development

```bash
npm test
npm run build
```
