# Research: Witboost AI Toolkit

**Phase**: 0 — Outline & Research | **Date**: 2026-06-14

## Decision Log

### 1. MCP Server Runtime & Protocol Library

**Decision**: TypeScript with `@modelcontextprotocol/sdk`, stdio transport

**Rationale**: The MCP SDK is the official TypeScript implementation maintained by Anthropic. Stdio transport is the standard for local MCP servers — it requires no network configuration, works across all OS platforms, and is supported by all major AI harnesses (VS Code Copilot, Claude Desktop, Codex CLI). TypeScript aligns with the VS Code/Copilot ecosystem and provides type safety for tool schema definitions.

**Alternatives considered**:
- Python (`mcp` package) — viable but adds a Python runtime dependency to target projects. Node.js is more commonly available in frontend/data engineering environments.
- Rust — excellent performance but slower development velocity and harder for contributors to modify. Overkill for an API-wrapping server.
- SSE/HTTP transport — requires port management, firewall configuration, and conflicts with multiple IDE instances. Stdio is simpler and more portable.

### 2. HTTP Client

**Decision**: `undici` (built into Node.js 18+)

**Rationale**: undici is Node.js's built-in HTTP client (backing `globalThis.fetch` since Node 18). Using it directly avoids external dependencies while providing full control over request/response handling, timeouts, and connection pooling. Since the MCP server bundles into a single file, zero external HTTP dependencies means the bundle is truly self-contained.

**Alternatives considered**:
- `node-fetch` — external dependency, less performant than undici, being deprecated in favor of built-in fetch.
- `axios` — heavy dependency with many transitive deps, problematic for single-file bundling.
- Built-in `fetch` — works but undici's `request()` API offers more control for streaming responses and custom headers without the overhead of the Fetch API abstraction.

### 3. Bundler

**Decision**: tsup (esbuild-based)

**Rationale**: tsup wraps esbuild with sensible TypeScript defaults. It produces a single CommonJS or ESM bundle in milliseconds, handles `node_modules` bundling (inlining the MCP SDK), and supports multiple entry points (server + setup script). The resulting `dist/index.js` is self-contained — target projects don't need `node_modules`.

**Alternatives considered**:
- Raw esbuild — viable but requires more manual configuration for TypeScript, declaration files, and multiple entry points.
- Rollup — slower, more complex config, better suited for libraries than bundled applications.
- webpack — far too heavy for this use case, slow build times.
- ncc (Vercel) — single-file bundler but less actively maintained and more opinionated.

### 4. Package Manager

**Decision**: npm

**Rationale**: The MCP server has its own `package.json` in `.witboost/mcp-server/`, completely isolated from the host project. npm is universally available with Node.js — no additional install step. During development in this repo, npm handles dev dependencies. In target projects, no package manager interaction is needed (the bundle is pre-built).

**Alternatives considered**:
- yarn — adds a dependency on yarn being installed. No benefit for an isolated package.
- pnpm — same concern. Better for monorepos, which this isn't in the target project context.

### 5. Agent Definition Format

**Decision**: Canonical YAML metadata + Markdown instruction templates in `.witboost/agents/`

**Rationale**: YAML captures structured metadata (name, description, tool dependencies, harness settings) while Markdown captures free-form instruction text (prompts, conversation flows, tool usage examples). This separation allows generators to extract metadata programmatically while preserving rich instruction content. Template variables (`{{TOOLS_LIST}}`, `{{CONFIG}}`) are resolved at setup time, not runtime.

**Alternatives considered**:
- Pure YAML with embedded strings — loses Markdown formatting, hard to read/edit for non-developers.
- Pure Markdown with frontmatter — works for simple cases but awkward for structured data like tool dependency lists and harness-specific settings.
- JSON — not human-friendly for instruction authoring.

### 6. Harness Generator Architecture

**Decision**: Pluggable generator modules, one per harness, implementing a common `HarnessGenerator` interface

**Rationale**: Each harness (Copilot, Claude, Codex) has distinct file format requirements. A pluggable architecture means adding a new harness requires only implementing the `HarnessGenerator` interface in a new module — no changes to existing generators or the setup script. The interface takes canonical agent definitions as input and produces harness-specific files as output.

**Alternatives considered**:
- Template files per harness — simpler but inflexible. Can't handle structural differences between harness formats (e.g., Copilot uses separate files per agent, Claude uses a single CLAUDE.md).
- Configuration-driven generation — attempted but harness formats differ too much in structure for a single config-driven approach to work cleanly.

### 7. Configuration System

**Decision**: YAML config file (`.witboost/config.yml`) with layered merging: defaults → project file → environment variables

**Rationale**: YAML is human-readable and supports comments (unlike JSON). Layered merging follows the principle of least surprise — defaults work out of the box, teams customize via the config file, individual developers override via environment variables. This matches constitution principle V (Customizability).

**Alternatives considered**:
- TOML — less familiar to the target audience (data engineers, platform engineers).
- dotenv only — insufficient for structured config (nested values, lists).
- JSON with JSON Schema — no comments, harder to edit manually.

### 8. Setup Script

**Decision**: Node.js script (`.witboost/setup.js`) — no shell dependencies, cross-platform

**Rationale**: Node.js is already required for the MCP server, so no additional runtime dependency. A Node.js script works identically on Windows, macOS, and Linux without shell compatibility issues (bash vs PowerShell vs zsh). The script is idempotent — running it multiple times produces identical output.

**Alternatives considered**:
- Shell script (bash) — doesn't work on Windows without WSL/Git Bash.
- PowerShell — doesn't work on macOS/Linux without PowerShell Core.
- Makefile — requires make, not available on Windows by default.
- Deno — additional runtime dependency, not widely installed.

### 9. Testing Framework

**Decision**: vitest

**Rationale**: vitest is the modern standard for TypeScript testing. It uses the same config as Vite/esbuild, supports ESM natively, runs fast with parallel execution, and has built-in snapshot testing (needed for generator output validation). It's a dev-time dependency only — not shipped to target projects.

**Alternatives considered**:
- Jest — heavier, slower, ESM support still experimental.
- Node.js test runner — too minimal, no snapshot support.
- Mocha/Chai — more setup, no built-in snapshot support.

### 10. Linting & Formatting

**Decision**: Biome

**Rationale**: Biome replaces both ESLint and Prettier in a single, fast tool. Written in Rust, it's orders of magnitude faster than ESLint. It handles formatting and linting with zero configuration for TypeScript. Dev-time only — not shipped.

**Alternatives considered**:
- ESLint + Prettier — two tools, slower, more config.
- dprint — fast formatter but no linting.

## Best Practices Research

### MCP Server Development Patterns

- **Tool registration**: Use a declarative registry pattern where each tool module exports a `ToolDefinition` object (name, description, inputSchema, handler). The server reads the registry at startup and registers all tools with the SDK. This avoids hardcoded tool lists in the server entry point.
- **Error handling**: MCP tools should return structured errors with codes and messages rather than throwing exceptions. The SDK expects tools to return `{ content: [...] }` or `{ content: [...], isError: true }`. Map HTTP errors from the Witboost API to meaningful tool error messages.
- **Input validation**: Use the JSON Schema `inputSchema` on each tool definition for automatic validation by the SDK. Don't duplicate validation in tool handlers.
- **Logging**: MCP servers communicate via stdio — don't write to stdout. Use the SDK's built-in logging facility which writes to stderr.

### Witboost API Integration Patterns

- **Authentication**: Bearer token in `Authorization` header. Token sourced from `WITBOOST_TOKEN` environment variable. Validate on startup by making a lightweight API call (e.g., `/api/v1/me` or similar health endpoint).
- **Base URL handling**: Normalize `WITBOOST_BASE_URL` — strip trailing slashes, validate URL format. Support both `https://witboost.example.com` and `https://witboost.example.com/api/v1`.
- **Rate limiting**: Respect `Retry-After` headers if the API returns 429. Surface rate limit errors clearly to the agent.
- **Pagination**: Witboost API likely uses cursor or offset pagination. Tools that list entities should accept optional pagination parameters and return pagination metadata.

### Agent Instruction Authoring

- **Tool references**: Agent instructions should reference MCP tools by exact name. Use template variables (e.g., `{{TOOLS_LIST}}`) to inject the current tool list at setup time so instructions stay in sync with tool definitions.
- **Conversation flow**: Structure agent instructions as a sequence of steps with decision points. Each step should specify: what context to check, what to ask the user, what tool to call, and how to present the result.
- **Error recovery**: Instructions should include guidance for common error scenarios (API unreachable, token expired, validation failures) so agents handle them gracefully instead of failing silently.
