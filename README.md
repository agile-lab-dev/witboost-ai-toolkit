# Witboost AI Toolkit

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

AI toolkit that turns Witboost platform APIs into an MCP server with 33 tools, paired with agentic instructions that drive the full data product lifecycle — discovery, creation, governance, and deployment — from inside your IDE.

## How It Works

The toolkit has two parts:

1. **MCP Server** — a single Node.js process that exposes 33 tools across 9 categories, callable by any MCP-compatible AI client (GitHub Copilot, Claude Code, Codex, etc.)
2. **Agent definitions** — canonical YAML+Markdown descriptions of workflows, skills, and rules that get translated into harness-specific files (`.agent.md`, `CLAUDE.md`, `AGENTS.md`, etc.)

When you run `node .witboost/mcp-server/setup.cjs --harness copilot`, the toolkit generates the files your IDE needs to connect to the MCP server and load the agent instructions. The AI can then autonomously create data products, implement business logic, validate against governance policies, and deploy — all through tool calls.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/agile-lab-dev/witboost-ai-toolkit.git
cd witboost-ai-toolkit
npm install

# 2. Build
npm run build

# 3. Copy .witboost/ into your data product repo
cp -r .witboost/ /path/to/your-repo/.witboost/
cp .env.example /path/to/your-repo/.env

# 4. Configure
cd /path/to/your-repo
# Edit .env — set WITBOOST_BASE_URL and either:
#   WITBOOST_TOKEN (PAT) or WITBOOST_AUTH_METHOD=sso

# 5. Generate IDE harness files
node .witboost/mcp-server/setup.cjs --harness copilot
```

## MCP Tools

33 tools across 9 categories:

| Category | Tools | Description |
|----------|-------|-------------|
| **Blueprints** | `list_blueprints`, `get_blueprint`, `list_templates`, `get_template_schema`, `get_template_parameters`, `validate_against_template` | Browse and inspect blueprints and scaffolder templates |
| **Data Products** | `list_data_products`, `get_data_product`, `create_data_product`, `update_data_product`, `delete_data_product` | CRUD operations on data products |
| **Components** | `list_components`, `add_component`, `remove_component` | Manage storage, workloads, and output ports |
| **Repositories** | `list_repositories`, `clone_repository` | Access component Git repos |
| **Validation** | `build_descriptor`, `validate_descriptor`, `run_tests`, `get_test_results` | Build descriptors, validate against policies, run provisioner tests |
| **Provisioning** | `deploy`, `undeploy`, `get_deployment_status`, `get_deployment_logs` | Deploy and monitor data products |
| **Governance** | `list_policies`, `get_policy`, `check_policies`, `get_approval_status`, `get_descriptor_specification` | Inspect policies, check compliance, retrieve the descriptor CUE schema. ⚠️ Requires WCG to be reachable/exposed (set `WITBOOST_WCG_URL` when needed) |
| **Marketplace** | `marketplace_search`, `marketplace_get_data_product`, `marketplace_get_output_ports`, `marketplace_get_output_port` | Discover published data products and their schemas |
| **Scaffolder** | (internal) | Template execution via the Witboost scaffolder API |

## Agent

A single unified agent (`witboost`) drives the full lifecycle with an autonomous validate-fix loop:

1. **Discover** — search the marketplace for upstream data products, inspect output port schemas
2. **Create** — scaffold data products and components from blueprints
3. **Implement** — write business logic (dbt, SQL, Spark, Python) following project conventions
4. **Validate** — build descriptors, validate against governance policies, fix errors autonomously
5. **Deploy** — provision to target environments, monitor, debug failures

The agent instructions are generic and policy-driven — governance-required fields are discovered at runtime from the platform's descriptor specification and policy engine, not hardcoded.

## Harness Generators

The setup script translates canonical agent definitions into harness-specific files:

| Harness | Generated files |
|---------|----------------|
| **GitHub Copilot** | `.github/agents/*.agent.md` + `.vscode/mcp.json` |
| **Claude Code** | `CLAUDE.md` + `.claude/settings.json` |
| **Gemini Code Assist** | `GEMINI.md` + `.gemini/settings.json` |
| **OpenAI Codex** | `AGENTS.md` |

```bash
node .witboost/mcp-server/setup.cjs --harness copilot   # or claude, gemini, codex
node .witboost/mcp-server/setup.cjs --dry-run            # preview without writing
node .witboost/mcp-server/setup.cjs --force              # overwrite existing files
```

## Configuration

### Environment variables (`.env`)

Place `.env` in the root of your **data product repo** (next to the `.witboost/` folder).

| Variable | Required | Description |
|----------|----------|-------------|
| `WITBOOST_BASE_URL` | Yes | Witboost platform URL |
| `WITBOOST_AUTH_METHOD` | No | `pat` (default) or `sso` — see below |
| `WITBOOST_TOKEN` | Yes (if `pat`) | Personal Access Token |
| `WITBOOST_WCG_URL` | No | Explicit Witboost Computational Governance URL (default: derived from base URL replacing `ui.` with `wcg.`) |
| `WITBOOST_API_VERSION` | No | API version (default: `v1`) |
| `WITBOOST_API_TIMEOUT` | No | Request timeout in ms (default: `30000`) |
| `WITBOOST_DEFAULT_DOMAIN` | No | Default domain for new data products |
| `WITBOOST_DEFAULT_ENVIRONMENT` | No | Default deployment environment |

### Authentication

The toolkit supports two authentication methods, controlled by `WITBOOST_AUTH_METHOD`:

| Method | `.env` setup | How it works |
|--------|-------------|--------------|
| **`pat`** (default) | Set `WITBOOST_TOKEN=wbat-…` | Uses your Personal Access Token, auto-exchanges it for a short-lived JWT |
| **`sso`** | Set `WITBOOST_AUTH_METHOD=sso` (no `WITBOOST_TOKEN` needed) | Opens a browser for SSO login on first run, then caches and auto-refreshes the JWT |

In SSO mode, the token is saved to `.witboost/token.json` and reused across restarts. When it expires, the toolkit tries a silent refresh first; if that fails, it opens the browser again.

### Project config

Optional YAML config at `.witboost/config.yml` — see `config/defaults.yml` for all options.

## Project Structure

```
.witboost/
├── mcp-server/
│   └── src/
│       ├── server/        # MCP server entry point, stdio transport
│       ├── tools/         # 9 tool modules (33 tools total)
│       ├── api/           # HTTP client for Witboost REST API
│       ├── config/        # Layered config (defaults → file → env)
│       ├── auth/          # OIDC login flow
│       ├── generators/    # Harness generators (copilot, claude, codex)
│       └── setup/         # Setup script CLI
├── agents/                # Canonical agent definitions (YAML + Markdown)
├── skills/                # Shared skill documents (SKILL.md)
└── config.yml             # Project configuration

config/                    # Default config and templates
tests/                     # Unit tests (vitest)
```

## Development

```bash
npm run build      # Build MCP server + setup script + copy assets
npm test           # Run all tests
npm run test:watch # Watch mode
npm run check      # TypeScript type check
npm run lint       # Biome lint
npm run format     # Biome format
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.
