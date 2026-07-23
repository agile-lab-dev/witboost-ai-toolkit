# Implementation Plan: Witboost AI Toolkit

**Branch**: `feat/witboost-ai-toolkit` | **Date**: 2026-06-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-witboost-ai-toolkit/spec.md`

## Summary

Build a portable AI toolkit (`.witboost/`) that wraps Witboost platform APIs as an MCP server and provides AI coding agents for managing the full data product lifecycle from the developer's IDE. The MCP server is a TypeScript stdio server bundled into a single `dist/index.js` via tsup. Agent definitions are stored in a canonical YAML+Markdown format and compiled to harness-specific files (Copilot, Claude, Codex, LangChain Deep Agents) by a cross-platform Node.js setup script. The entire toolkit deploys by copying dot-folders into any data product repository with zero host-project modifications.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 18

**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP protocol), `undici` (HTTP client, built into Node.js 18+), `yaml` (config parsing), `tsup` (bundler), `vitest` (testing), `@biomejs/biome` (linting/formatting)

**Storage**: N/A — stateless server; all state lives in the Witboost platform API

**Testing**: vitest for unit tests, snapshot tests for harness generator output

**Target Platform**: Cross-platform (Windows, macOS, Linux) — anywhere Node.js 18+ runs

**Project Type**: Developer toolkit / MCP server + code generation pipeline

**Performance Goals**: MCP server startup < 5s, individual tool calls < 3s (excluding network latency to Witboost API)

**Constraints**: Zero external runtime dependencies in target projects (self-contained bundle), all files in dot-prefixed directories, no host project modifications

**Scale/Scope**: ~20 MCP tools across 7 API categories, 3 core agents, 4 harness generators, 1 setup script

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Portability First | ✅ PASS | All toolkit files reside under `.witboost/`, `.github/agents/`, `.github/prompts/`, `.claude/`, `.vscode/` — all dot-prefixed. Copy-paste deployable. No host project modifications. Removal = delete dot-folders. |
| II | Multi-Harness Compatibility | ✅ PASS | Canonical definitions in `.witboost/agents/` compiled to Copilot/Claude/Codex/Deep Agents formats by pluggable generators. Adding a harness = adding one generator module. Generated files are not hand-edited. |
| III | Conversational UX | ✅ PASS | Agent instructions mandate asking for missing values rather than guessing. Agents present pick-lists for bounded choices (blueprints, environments, components). |
| IV | API-First Design | ✅ PASS | Each MCP tool is a pure function: params → API call → structured result. Tools registered declaratively in a registry. Tools do not invoke other tools or embed orchestration. |
| V | Customizability | ✅ PASS | Layered config: defaults → `.witboost/config.yml` → environment variables. Custom agents in `.witboost/agents/custom/` included alongside core agents. Core files treated as read-only. |
| VI | Security by Default | ✅ PASS | Credentials from env vars only (`WITBOOST_BASE_URL`, `WITBOOST_TOKEN`). `.gitignore` rules for sensitive paths. Agents refuse to embed secrets in committed files. |

**Gate result**: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-witboost-ai-toolkit/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions and rationale
├── data-model.md        # Phase 1: entity model and type definitions
├── quickstart.md        # Phase 1: developer getting-started guide
├── contracts/           # Phase 1: external interface definitions
│   ├── mcp-tools.md     #   MCP tool schemas (inputs/outputs/errors)
│   ├── config-schema.md #   Configuration file schema
│   └── agent-definition-schema.md  # Canonical agent YAML format
└── tasks.md             # Phase 2: implementation tasks (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Development source (this repo)
src/
├── server/
│   ├── index.ts              # Entry point — create & start MCP server
│   ├── server.ts             # Server setup, tool registration
│   └── transport.ts          # stdio transport wrapper
├── tools/
│   ├── registry.ts           # Declarative tool registry
│   ├── types.ts              # ToolDefinition, ToolResult types
│   ├── blueprints.ts         # list_blueprints, get_blueprint_schema, get_blueprint_parameters
│   ├── data-products.ts      # create_data_product, get_data_product, list_data_products, update_data_product, delete_data_product
│   ├── components.ts         # add_component, remove_component, list_components
│   ├── repositories.ts       # clone_repository, list_repositories
│   ├── provisioning.ts       # deploy, undeploy, get_deployment_status, get_deployment_logs
│   ├── testing.ts            # validate_descriptor, run_tests, get_test_results
│   └── governance.ts         # check_policies, get_approval_status
├── api/
│   ├── client.ts             # WitboostApiClient — undici-based HTTP client
│   └── types.ts              # API request/response types
├── config/
│   ├── loader.ts             # Layered config: defaults → file → env
│   └── schema.ts             # Config validation schema
├── generators/
│   ├── types.ts              # HarnessGenerator interface
│   ├── copilot.ts            # VS Code Copilot generator
│   ├── claude.ts             # Claude Code generator
│   ├── codex.ts              # OpenAI Codex generator
│   └── deepagents.ts         # LangChain Deep Agents generator (Python module output)
└── setup/
    └── index.ts              # Setup script — generates harness files

# Canonical agent definitions (shipped as-is into .witboost/agents/)
agents/
├── core/
│   ├── dp-creator/
│   │   ├── agent.yml         # Agent metadata, tool deps, config
│   │   └── instructions.md   # Prompt template with {{TOOLS_LIST}}, {{CONFIG}} variables
│   ├── biz-logic/
│   │   ├── agent.yml
│   │   └── instructions.md
│   └── test-deploy/
│       ├── agent.yml
│       └── instructions.md
└── custom/                   # Placeholder for user extensions (empty, .gitkeep)

# Shared skills (SKILL.md format, compatible with Deep Agents & Claude Code)
skills/
├── witboost-catalog/
│   └── SKILL.md              # Skill: navigating the Witboost catalog
└── witboost-deploy/
    └── SKILL.md              # Skill: deployment troubleshooting patterns

# Default configuration
config/
└── defaults.yml              # Shipped defaults for .witboost/config.yml

# Tests
tests/
├── unit/
│   ├── tools/                # One test file per tool module
│   ├── api/                  # API client tests (mocked HTTP)
│   ├── config/               # Config loader tests
│   └── generators/           # Generator output tests
├── snapshots/                # Snapshot tests for generator output per harness
└── fixtures/                 # Test data: sample descriptors, API responses

# Build & tooling config
package.json                  # Dev deps only: sdk, tsup, vitest, biome
tsconfig.json
tsup.config.ts                # Two entry points: server → dist/mcp-server/index.js, setup → dist/setup.js
biome.json
```

### Build Output (distributable `.witboost/` folder)

```text
.witboost/                    # Copy this folder into target data product repos
├── mcp-server/
│   ├── dist/
│   │   └── index.js          # Self-contained MCP server bundle
│   └── package.json          # Minimal: name, version, main, bin
├── agents/                   # Copied from agents/ source
│   ├── core/
│   │   ├── dp-creator/
│   │   ├── biz-logic/
│   │   └── test-deploy/
│   └── custom/
├── generators/               # Built generator modules
│   ├── copilot.js
│   ├── claude.js
│   ├── codex.js
│   └── deepagents.js
├── harness/                  # Generated harness-specific outputs
│   └── deepagents/           # Generated by setup --harness deepagents
│       ├── __init__.py       # Exports: create_dp_agent, implement_agent, deploy_agent
│       ├── create_dp.py      # Pre-wired create_deep_agent() for DP creation
│       ├── implement.py      # Pre-wired create_deep_agent() for biz logic
│       ├── deploy.py         # Pre-wired create_deep_agent() for test & deploy
│       └── requirements.txt  # deepagents, langchain-mcp-adapters
├── skills/                   # Shared SKILL.md files
│   ├── witboost-catalog/
│   │   └── SKILL.md
│   └── witboost-deploy/
│       └── SKILL.md
├── config.yml                # Default configuration
├── setup.js                  # Built setup script
└── .gitignore                # Ignores local.yml, .env, node_modules
```

**Structure Decision**: Single-project layout. The repo develops three build targets (MCP server bundle, setup script, generators) from a unified `src/` tree, bundled by tsup into a distributable `.witboost/` folder. No separate frontend/backend — this is a CLI/server-only project. Agents are static YAML+Markdown files shipped as-is.

## Complexity Tracking

No constitution violations. No complexity justifications needed.

## Deep Agents Integration Notes

LangChain Deep Agents is a **programmatic harness** (Python/JS), not file-based like Copilot/Claude/Codex. The generator produces importable Python modules rather than Markdown files.

### Architecture

```
Canonical Definition          Deep Agents Generator          Output
─────────────────────────────────────────────────────────────────────
agent.yml                  →  Extracts tool list, name      →  .py module
instructions.md            →  Injected as system_prompt     →  with create_deep_agent()
                              MCP tools loaded via           
                              langchain-mcp-adapters         
```

### Key Design Decisions

- **MCP bridge**: Uses `langchain-mcp-adapters` to load the same Node.js MCP server as a tool provider. The MCP server runs as a subprocess, communicating via stdio — same as all other harnesses.
- **Skills reuse**: Deep Agents uses the same `SKILL.md` frontmatter+Markdown format. The `.witboost/skills/` directory is passed as a skills source to `SkillsMiddleware`.
- **No Python in core**: The generator is TypeScript (like all generators). It emits `.py` files as text output. The generated Python modules are self-contained and only require `deepagents` + `langchain-mcp-adapters` at runtime.
- **Subagent composition**: Each Witboost agent can be used as a `SubAgent` in a larger Deep Agent graph, enabling composition (e.g., a "full lifecycle" agent that delegates to create → implement → deploy).
