# Quickstart: Witboost AI Toolkit

**Phase**: 1 — Design & Contracts | **Date**: 2026-06-14

## Prerequisites

- **Node.js 18+** installed (`node --version`)
- **Witboost platform access** with a valid API token
- **AI coding agent** — VS Code with GitHub Copilot, Claude Code, or OpenAI Codex CLI

## 1. Install the Toolkit

Copy the `.witboost/` folder into your data product repository root:

```bash
# From a release archive
cp -r witboost-ai-toolkit/.witboost/ /path/to/your-data-product-repo/
```

Or clone this development repo and build:

```bash
git clone <this-repo>
cd witboost-ai-toolkit
npm install
npm run build
# Copy .witboost/ to your target repo
cp -r .witboost/ /path/to/your-data-product-repo/
```

## 2. Configure Environment

Set the required environment variables:

```bash
# Required
export WITBOOST_BASE_URL="https://your-witboost-instance.example.com"
export WITBOOST_TOKEN="your-api-token"
```

Optionally customize `.witboost/config.yml` for project-level defaults:

```yaml
defaults:
  domain: "marketing"
  environment: "development"
```

## 3. Generate Agent Files

Run the setup script to generate harness-specific configuration:

```bash
# Default: generates VS Code Copilot files
node .witboost/setup.js

# For Claude Code
node .witboost/setup.js --harness claude

# For multiple harnesses
node .witboost/setup.js --harness copilot --harness claude

# Preview without writing files
node .witboost/setup.js --dry-run
```

This generates:
- **Copilot**: `.github/agents/*.agent.md`, `.github/instructions/*.instructions.md`, `.vscode/mcp.json`
- **Claude**: `CLAUDE.md`, `.claude/` config files
- **Codex**: `AGENTS.md`

## 4. Start Using Agents

### VS Code Copilot

1. Open the repository in VS Code
2. The MCP server starts automatically (configured in `.vscode/mcp.json`)
3. In the Copilot chat, type `@dp-creator` to invoke the Data Product Creator agent

### Claude Code

1. Open the repository in Claude Code
2. The MCP server is configured in `.claude/` settings
3. Describe your task — Claude reads `CLAUDE.md` for available workflows

### Available Agents

| Agent | Copilot Command | Description |
|-------|----------------|-------------|
| Data Product Creator | `@dp-creator` | Create a new data product from a blueprint |
| Business Logic Implementer | `@biz-logic` | Implement business logic in a component |
| Test & Deploy | `@test-deploy` | Validate, test, and deploy a data product |

## 5. Verify Setup

Test that the MCP server is working:

```bash
# Start the server manually and send a tools/list request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node .witboost/mcp-server/dist/index.js
```

You should see a JSON response listing all available tools.

## Development (Contributing to the Toolkit)

```bash
# Clone the development repo
git clone <this-repo>
cd witboost-ai-toolkit

# Install dev dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint & format
npm run lint
npm run format

# Build the MCP server and copy config assets into .witboost/
npm run build

# The .witboost/ folder is ready to copy into target repos
```

## Removal

To remove the toolkit completely:

```bash
rm -rf .witboost/ .github/agents/ .github/instructions/ .claude/ .vscode/mcp.json CLAUDE.md AGENTS.md
```

No other files in your repository are affected.
