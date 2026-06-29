# Contributing to Witboost AI Toolkit

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/agile-lab-dev/witboost-ai-toolkit.git
cd witboost-ai-toolkit
npm install
```

## Build & Test

```bash
npm run build      # Build MCP server bundle + copy assets into .witboost/
npm test           # Run all tests
npm run test:watch # Watch mode
npm run check      # TypeScript type check
npm run lint       # Biome lint
npm run format     # Biome format
```

## Project Layout

| Path | Purpose |
|------|---------|
| `.witboost/mcp-server/src/` | MCP server source (TypeScript) |
| `.witboost/mcp-server/tests/` | Unit tests |
| `.witboost/agents/` | Canonical agent definitions (YAML + Markdown) |
| `.witboost/skills/` | Shared SKILL.md files |
| `config/` | Template config files copied during build |
| `scripts/` | Build helper scripts |
| `specs/` | Design documentation |

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm test` and `npm run lint` — all must pass
4. Submit a pull request

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting.
Run `npm run format` before committing.

## Adding an MCP Tool

1. Add the tool definition in the appropriate module under `.witboost/mcp-server/src/tools/`
2. Tools self-register via `registerTools()` — import the module in `src/server/server.ts`
3. Add corresponding unit tests under `.witboost/mcp-server/tests/unit/tools/`

## Adding an Agent

1. Create a directory under `.witboost/agents/core/<agent-name>/`
2. Add `agent.yml` (metadata) and `instructions.md` (prompt template)
3. See existing agents for the expected format

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
