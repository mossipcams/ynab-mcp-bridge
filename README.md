[![MseeP.ai Security Assessment Badge](https://mseep.net/mseep-audited.png)](https://mseep.ai/app/mossipcams-ynab-mcp-bridge)

# ynab-mcp-bridge
[![smithery badge](https://smithery.ai/badge/@mossipcams/ynab-mcp-bridge)](https://smithery.ai/server/@mossipcams/ynab-mcp-bridge)

A Model Context Protocol (MCP) server for YNAB. It now supports both:

* `stdio` mode for local tooling and debugging
* authless `Streamable HTTP` mode for remote deployments such as an isolated Proxmox LXC

This MCP provides tools
for interacting with your YNAB budgets setup at https://ynab.com

<a href="https://glama.ai/mcp/servers/@mossipcams/ynab-mcp-bridge">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@mossipcams/ynab-mcp-bridge/badge" alt="YNAB Bridge MCP server" />
</a>

In order to have an AI interact with this tool, you will need to get your Personal Access Token
from YNAB: https://api.ynab.com/#personal-access-tokens. When adding this MCP server to any
client, you will need to provide your personal access token as YNAB_API_TOKEN. **This token
is never directly sent to the LLM.** It is stored privately in an environment variable for
use with the YNAB api.

## Setup
Specify env variables:
* YNAB_API_TOKEN (required)
* YNAB_BUDGET_ID (optional)
* MCP_TRANSPORT (optional: `stdio` or `http`, default `stdio`)
* MCP_HOST (optional, HTTP mode only, default `0.0.0.0`)
* MCP_PORT (optional, HTTP mode only, default `3000`)
* MCP_PATH (optional, HTTP mode only, default `/mcp`)

## Goal
The goal of the project is to be able to interact with my YNAB budget via an AI conversation.
There are a few primary workflows I want to enable:

## Workflows:
### First time setup
* be prompted to select your budget from your available budgets. If you try to use another
tool first, this prompt should happen asking you to set your default budget.
  * Tools needed: ListBudgets
### Manage overspent categories
### Adding new transactions
### Approving transactions
### Check total monthly spending vs total income
### Auto-distribute ready to assign funds based on category targets

## Current state
Available tools:
* ListBudgets - lists available budgets on your account
* BudgetSummary - provides a summary of categories that are underfunded and accounts that are low
* GetUnapprovedTransactions - retrieve all unapproved transactions
* CreateTransaction - creates a transaction for a specified budget and account.
  * example prompt: `Add a transaction to my Ally account for $3.98 I spent at REI today`
  * requires GetBudget to be called first so we know the account id
* ApproveTransaction - approves an existing transaction in your YNAB budget
  * requires a transaction ID to approve
  * can be used in conjunction with GetUnapprovedTransactions to approve pending transactions
  * After calling get unapproved transactions, prompt: `approve the transaction for $6.95 on the Apple Card`

Next:
* be able to approve multiple transactions with 1 call
* updateCategory tool - or updateTransaction more general tool if I can get optional parameters to work correctly with zod & mcp framework
* move off of mcp framework to use the model context protocol sdk directly?


## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run locally over stdio
npm run start:stdio

# Run as an authless Streamable HTTP server
npm run start:http
```

## Runtime Modes

### stdio

This preserves the original local process model:

```bash
node dist/index.js --transport stdio
```

### Streamable HTTP

This is the remote-friendly mode for an isolated host or container:

```bash
node dist/index.js --transport http --host 0.0.0.0 --port 3000 --path /mcp
```

Equivalent environment-variable configuration:

```bash
MCP_TRANSPORT=http
MCP_HOST=0.0.0.0
MCP_PORT=3000
MCP_PATH=/mcp
node dist/index.js
```

Notes:

* HTTP mode is stateless
* HTTP mode is authless by design
* the YNAB credential still stays server-side in `YNAB_API_TOKEN`

## Proxmox LXC Deployment

For an isolated Proxmox LXC, the intended setup is:

1. Copy the repo into the container and install dependencies.
2. Set `YNAB_API_TOKEN` and optionally `YNAB_BUDGET_ID`.
3. Start the server in HTTP mode:

```bash
MCP_TRANSPORT=http \
MCP_HOST=0.0.0.0 \
MCP_PORT=3000 \
MCP_PATH=/mcp \
YNAB_API_TOKEN=your-token \
node dist/index.js
```

The remote MCP endpoint will then be:

```text
http://<lxc-ip>:3000/mcp
```

## Project Structure

```
ynab-mcp-bridge/
├── src/
│   ├── tools/        # MCP Tools
│   └── index.ts      # Server entry point
├── .cursor/
│   └── rules/        # Cursor AI rules for code generation
├── package.json
└── tsconfig.json
```

## Adding Components

The YNAB sdk describes the available api endpoints: https://github.com/ynab/ynab-sdk-js.

YNAB open api specification is here: https://api.ynab.com/papi/open_api_spec.yaml. This can
be used to prompt an AI to generate a new tool. Example prompt for Cursor Agent:

```
create a new tool based on the readme and this openapi doc: https://api.ynab.com/papi/open_api_spec.yaml

The new tool should get the details for a single budget
```

You can add more tools using the CLI:

```bash
# Add a new tool
mcp add tool my-tool

# Example tools you might create:
mcp add tool data-processor
mcp add tool api-client
mcp add tool file-handler
```

## Tool Development

Example tool structure:

```typescript
import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface MyToolInput {
  message: string;
}

class MyTool extends MCPTool<MyToolInput> {
  name = "my_tool";
  description = "Describes what your tool does";

  schema = {
    message: {
      type: z.string(),
      description: "Description of this input parameter",
    },
  };

  async execute(input: MyToolInput) {
    // Your tool logic here
    return `Processed: ${input.message}`;
  }
}

export default MyTool;
```

## Publishing to npm

1. Update your package.json:
   - Ensure `name` is unique and follows npm naming conventions
   - Set appropriate `version`
   - Add `description`, `author`, `license`, etc.
   - Check `bin` points to the correct entry file

2. Build and test locally:
   ```bash
   npm run build
   npm link
   ynab-mcp-bridge  # Test your CLI locally
   ```

3. Login to npm (create account if necessary):
   ```bash
   npm login
   ```

4. Publish your package:
   ```bash
   npm publish
   ```

After publishing, users can add it to their claude desktop client (read below) or run it with npx


## Using with Claude Desktop

### Installing via Smithery

To install YNAB Budget Assistant for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@mossipcams/ynab-mcp-bridge):

```bash
npx -y @smithery/cli install @mossipcams/ynab-mcp-bridge --client claude
```

### Local Development Over stdio

Add this configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ynab-mcp-bridge": {
      "command": "node",
      "args":["/absolute/path/to/ynab-mcp-bridge/dist/index.js", "--transport", "stdio"]
    }
  }
}
```

### After Publishing

Add this configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ynab-mcp-bridge": {
      "command": "npx",
      "args": ["ynab-mcp-bridge", "--transport", "stdio"]
    }
  }
}
```

### Remote HTTP Deployment

If you are running this server on an isolated machine such as a Proxmox LXC, use HTTP mode and point your MCP-capable client at:

```text
http://<lxc-ip>:3000/mcp
```

This server does not require HTTP authorization headers in that mode.

### Other MCP Clients
Check https://modelcontextprotocol.io/clients for other available clients.

## Building and Testing

1. Make changes to your tools
2. Run `npm run build` to compile
3. The server will automatically load your tools on startup

## Learn More

- [MCP Framework Github](https://github.com/QuantGeekDev/mcp-framework)
- [MCP Framework Docs](https://mcp-framework.com)
