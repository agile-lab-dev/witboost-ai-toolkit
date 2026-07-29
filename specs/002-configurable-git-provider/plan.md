# Implementation Plan: Configurable Git Provider URL

**Branch**: `master` | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-configurable-git-provider/spec.md`

## Summary

Generalize all hardcoded `gitlab.com` hostname references in the MCP server by introducing a `GIT_BASE_URL` environment variable (and a `git.baseUrl` config-file key). The resolved hostname defaults to `gitlab.com` when not set, preserving full backward compatibility. Three tool files (`repositories.ts`, `data-products.ts`, `components.ts`) plus the config schema and loader receive targeted edits. No tool signatures or API contracts change.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 18

**Primary Dependencies**: Existing project stack — `yaml` (config parsing), `vitest` (testing), `@biomejs/biome` (linting). No new runtime dependencies.

**Storage**: N/A — stateless server; hostname resolved once at startup from env/config.

**Testing**: vitest — unit tests for config loader (new `gitHost` field) and URL-construction helpers.

**Target Platform**: Cross-platform (Windows, macOS, Linux) — same as parent project.

**Project Type**: Enhancement to existing MCP server toolkit (minimal, targeted edit).

**Performance Goals**: Zero overhead — `gitHost` is a string resolved once at server startup; no runtime I/O.

**Constraints**: Strict backward compatibility — users who do not set `GIT_BASE_URL` MUST get identical behavior to the current hardcoded implementation. No new dependencies.

**Scale/Scope**: 3 tool files modified, 2 config files modified (schema.ts, loader.ts), 2 documentation files updated (.env.example, config/defaults.yml), 1 new unit-test suite.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Portability First | ✅ PASS | `GIT_BASE_URL` is read from `.env` and `.witboost/config.yml` — both already dot-folder files. No new directories or host-project files introduced. |
| II | Multi-Harness Compatibility | ✅ PASS | No harness-specific files (copilot-instructions, claude, codex) are touched. Config is server-side; harness generators are unaffected. |
| III | Conversational UX | ✅ PASS | No agent instruction files change. URL construction is an internal server concern, invisible to conversation flow. |
| IV | API-First Design | ✅ PASS | No MCP tool signatures change. `gitHost` is an implementation detail of URL construction inside tool handlers; tool inputs/outputs are unchanged. |
| V | Customizability | ✅ PASS | Follows the existing layered config pattern: built-in default (`gitlab.com`) → `config.yml` (`git.baseUrl`) → env var (`GIT_BASE_URL`). Consistent with how `WITBOOST_BASE_URL` is already handled. |
| VI | Security by Default | ✅ PASS | `GIT_BASE_URL` is a non-sensitive hostname string. No credentials involved. Normalization prevents injection via scheme prefix. |

**Gate result**: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/002-configurable-git-provider/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and rationale
├── data-model.md        # Phase 1: GitHost entity and config model
├── quickstart.md        # Phase 1: validation guide
├── contracts/           # Phase 1: updated config schema
│   └── config-schema.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (affected files only)

```text
.witboost/mcp-server/src/
├── config/
│   ├── schema.ts          # ADD gitHost to WitboostConfig + git.baseUrl to RawConfigFile
│   └── loader.ts          # ADD GIT_BASE_URL resolution + normalizeGitHost() helper
└── tools/
    ├── repositories.ts    # REPLACE hardcoded 'gitlab.com' with ctx.config.gitHost
    ├── data-products.ts   # REPLACE hardcoded 'gitlab.com' with ctx.config.gitHost
    └── components.ts      # REPLACE hardcoded 'gitlab.com' with ctx.config.gitHost

.witboost/mcp-server/tests/unit/config/
└── loader.test.ts         # ADD tests for gitHost resolution and normalization

config/
└── defaults.yml           # ADD git.baseUrl comment block (documented default)

.env.example               # ADD GIT_BASE_URL entry with explanatory comment
```

**Structure Decision**: Single-project layout. All changes are within `.witboost/mcp-server/src/` (existing structure). No new top-level directories.
