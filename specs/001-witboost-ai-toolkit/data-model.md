# Data Model: Witboost AI Toolkit

**Phase**: 1 — Design & Contracts | **Date**: 2026-06-14

## Core Entities

### 1. ToolDefinition

Represents a single MCP tool registered in the server.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Unique tool identifier (snake_case, e.g., `list_blueprints`) |
| `description` | `string` | ✅ | Human-readable description for agent consumption |
| `category` | `ToolCategory` | ✅ | Functional grouping: `blueprints`, `data-products`, `components`, `repositories`, `provisioning`, `testing`, `governance` |
| `inputSchema` | `JSONSchema` | ✅ | JSON Schema defining accepted input parameters |
| `handler` | `(params, context) => ToolResult` | ✅ | Pure function that executes the tool logic |

**Validation rules**:
- `name` must be unique across all registered tools
- `name` must match pattern `^[a-z][a-z0-9_]*$`
- `inputSchema` must be a valid JSON Schema object
- `handler` must be an async function

### 2. ToolResult

Standardized return type from every tool handler.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `Content[]` | ✅ | Array of content items (text, JSON, etc.) |
| `isError` | `boolean` | ❌ | `true` if the tool execution failed. Default: `false` |

**Content item types**:
- `{ type: "text", text: string }` — plain text or Markdown
- `{ type: "resource", resource: { uri, mimeType, text } }` — embedded resource

### 3. WitboostConfig

Parsed and validated configuration from the layered config system.

| Field | Type | Required | Default | Source |
|-------|------|----------|---------|--------|
| `baseUrl` | `string` (URL) | ✅ | — | `WITBOOST_BASE_URL` env var |
| `token` | `string` | ✅ | — | `WITBOOST_TOKEN` env var |
| `defaultDomain` | `string` | ❌ | `""` | `config.yml` → `defaults.domain` |
| `defaultEnvironment` | `string` | ❌ | `""` | `config.yml` → `defaults.environment` |
| `apiVersion` | `string` | ❌ | `"v1"` | `config.yml` → `api.version` |
| `requestTimeout` | `number` (ms) | ❌ | `30000` | `config.yml` → `api.timeout` |

**Validation rules**:
- `baseUrl` must be a valid URL with `http` or `https` scheme
- `token` must be a non-empty string
- `requestTimeout` must be a positive integer

**Config resolution order** (later wins):
1. Built-in defaults (hardcoded in `config/schema.ts`)
2. `.witboost/config.yml` (project-level)
3. Environment variables (`WITBOOST_BASE_URL`, `WITBOOST_TOKEN`, etc.)

### 4. ApiClient

HTTP client wrapper for Witboost REST API calls.

| Field | Type | Description |
|-------|------|-------------|
| `config` | `WitboostConfig` | Resolved configuration |
| `baseUrl` | `string` | Normalized API base URL |

**Methods**:

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `get<T>` | `path: string, query?: Record` | `ApiResponse<T>` | GET request |
| `post<T>` | `path: string, body?: unknown` | `ApiResponse<T>` | POST request |
| `put<T>` | `path: string, body?: unknown` | `ApiResponse<T>` | PUT request |
| `delete<T>` | `path: string` | `ApiResponse<T>` | DELETE request |

**ApiResponse type**:

| Field | Type | Description |
|-------|------|-------------|
| `data` | `T` | Parsed response body |
| `status` | `number` | HTTP status code |
| `ok` | `boolean` | `true` if status is 2xx |
| `error` | `ApiError \| undefined` | Error details if `ok` is false |

**ApiError type**:

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string` | Error code (e.g., `UNAUTHORIZED`, `NOT_FOUND`, `RATE_LIMITED`) |
| `message` | `string` | Human-readable error message |
| `status` | `number` | HTTP status code |
| `retryAfter` | `number \| undefined` | Seconds to wait before retrying (for 429 responses) |

### 5. AgentDefinition

Canonical agent definition parsed from YAML+Markdown files.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Agent identifier (kebab-case, e.g., `dp-creator`) |
| `displayName` | `string` | ✅ | Human-readable name (e.g., "Data Product Creator") |
| `description` | `string` | ✅ | One-line description of the agent's purpose |
| `tools` | `string[]` | ✅ | List of MCP tool names this agent depends on |
| `category` | `string` | ❌ | Grouping category (e.g., `lifecycle`, `custom`) |
| `instructions` | `string` | ✅ | Markdown instruction template (from companion `.md` file) |
| `variables` | `Record<string, string>` | ❌ | Template variables to resolve (e.g., `TOOLS_LIST`, `CONFIG`) |
| `harness` | `HarnessOverrides` | ❌ | Per-harness overrides (command names, file paths) |

**HarnessOverrides type**:

| Field | Type | Description |
|-------|------|-------------|
| `copilot` | `{ command?: string, promptFile?: string }` | Copilot-specific overrides |
| `claude` | `{ subcommand?: string }` | Claude-specific overrides |
| `codex` | `{ section?: string }` | Codex-specific overrides |

### 6. HarnessGenerator

Interface for pluggable harness-specific file generators.

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `generate` | `agents: AgentDefinition[], config: WitboostConfig, outputDir: string` | `GeneratedFile[]` | Generate harness-specific files from canonical definitions |
| `harnessName` | — | `string` | Identifier for this harness (e.g., `copilot`, `claude`, `codex`) |

**GeneratedFile type**:

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Relative path from repo root (e.g., `.github/agents/dp-creator.agent.md`) |
| `content` | `string` | File content |
| `overwrite` | `boolean` | Whether to overwrite existing files (default: `true`) |

## Domain Entities (Witboost Platform)

These entities represent Witboost platform objects accessed via the API. They are not defined in the toolkit's source code but are the data shapes returned by MCP tools.

### 7. Blueprint

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Blueprint identifier |
| `name` | `string` | Display name |
| `description` | `string` | Blueprint description |
| `version` | `string` | Blueprint version |
| `schema` | `JSONSchema` | Template parameter schema |
| `parameters` | `Record<string, unknown>` | Default parameter values |

### 8. DataProduct

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Data product identifier (URN) |
| `name` | `string` | Display name |
| `domain` | `string` | Domain identifier |
| `version` | `string` | Version string |
| `description` | `string` | Data product description |
| `owner` | `string` | Owner identifier |
| `components` | `ComponentRef[]` | References to child components |
| `status` | `string` | Current lifecycle status |

### 9. Component

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Component identifier (URN) |
| `name` | `string` | Display name |
| `type` | `string` | Component type (e.g., `storage`, `outputport`, `workload`) |
| `technology` | `string` | Tech stack identifier |
| `descriptor` | `Record<string, unknown>` | Component descriptor section |
| `status` | `string` | Provisioning status |

### 10. DeploymentStatus

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Deployment identifier |
| `dataProductId` | `string` | Associated data product |
| `environment` | `string` | Target environment |
| `status` | `"pending" \| "in_progress" \| "completed" \| "failed"` | Current status |
| `startedAt` | `string` (ISO 8601) | Deployment start timestamp |
| `completedAt` | `string \| undefined` | Deployment completion timestamp |
| `logs` | `string[]` | Log entries |
| `errors` | `string[]` | Error messages (if failed) |

## Entity Relationships

```text
ToolDefinition ──registers──▶ MCP Server
     │
     └── handler calls ──▶ ApiClient ──▶ Witboost REST API
                                              │
                                              ├──▶ Blueprint
                                              ├──▶ DataProduct ──has──▶ Component[]
                                              ├──▶ DeploymentStatus
                                              └──▶ PolicyResult

AgentDefinition ──compiled by──▶ HarnessGenerator ──produces──▶ GeneratedFile[]
     │
     └── references ──▶ ToolDefinition.name[]

WitboostConfig ──loaded by──▶ ConfigLoader
     │
     ├── injected into ──▶ ApiClient
     └── injected into ──▶ HarnessGenerator (for template variable resolution)
```

## State Transitions

### Deployment Lifecycle

```text
                    ┌──────────┐
                    │  pending  │
                    └─────┬────┘
                          │ deploy tool called
                    ┌─────▼─────┐
                    │in_progress │
                    └─────┬─────┘
                          │
               ┌──────────┴──────────┐
               │                     │
        ┌──────▼──────┐       ┌──────▼──────┐
        │  completed   │       │   failed    │
        └──────┬──────┘       └─────────────┘
               │ undeploy tool called
        ┌──────▼──────┐
        │   pending    │ (back to initial state)
        └─────────────┘
```
