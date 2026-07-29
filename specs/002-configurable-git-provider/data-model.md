# Data Model: Configurable Git Provider URL

**Phase**: 1 — Design | **Date**: 2026-07-29 | **Plan**: [plan.md](plan.md)

## Overview

This feature introduces one new configuration field (`gitHost`) into the existing config model. No new persistent entities, databases, or data stores are introduced. All state is resolved at server startup from environment variables and the config file.

## Entities

### GitHost

**What it represents**: A validated, normalized bare hostname string identifying the Git provider instance (e.g., `gitlab.com`, `gitlab.mycompany.com`, `gitlab.mycompany.com:8080`). It is the single authoritative source of truth for constructing all Git-related URLs in the MCP server.

**Fields**:
| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `value` | `string` | Non-empty after normalization; bare hostname with optional port; no scheme prefix; no trailing slash | `"gitlab.com"` |

**Derived URLs** (not stored — computed on demand):
| URL Type | Format | Example |
|----------|--------|---------|
| HTTPS clone URL | `https://<gitHost>/<path>.git` | `https://gitlab.mycompany.com/finance/storage.git` |
| SSH clone URL | `git@<gitHost>:<path>.git` | `git@gitlab.mycompany.com:finance/storage.git` |
| Scaffold repoUrl | `<gitHost>?owner=<encodedGroup>&repo=<name>` | `gitlab.mycompany.com?owner=finance%2Fspend&repo=myComp` |

**Validation rules**:
- After normalization (scheme stripped, trailing slash stripped), MUST be non-empty
- If empty after normalization, silently falls back to `"gitlab.com"`
- Port numbers (e.g., `:8080`) are preserved as part of the host string

**State transitions**: N/A — `GitHost` is immutable for the lifetime of a server process. Changes require restarting the MCP server.

---

### WitboostConfig (updated)

**What it represents**: The existing top-level configuration record for the MCP server. Extended with the `gitHost` field.

**New field added**:
| Field | Type | Source priority (high → low) | Default |
|-------|------|------------------------------|---------|
| `gitHost` | `string` | `GIT_BASE_URL` env var → `git.baseUrl` in `config.yml` → built-in default | `"gitlab.com"` |

**Existing fields** (unchanged): `baseUrl`, `token`, `wcgUrl`, `defaultDomain`, `defaultEnvironment`, `apiVersion`, `requestTimeout`

---

### RawConfigFile (updated)

**What it represents**: The deserialized shape of `.witboost/config.yml`. Extended with a new optional `git` section.

**New section added**:
```yaml
git:
  baseUrl: "gitlab.mycompany.com"   # Optional; overridden by GIT_BASE_URL env var
```

**Field**:
| YAML path | Type | Description |
|-----------|------|-------------|
| `git.baseUrl` | `string` (optional) | Bare hostname of the Git provider. Normalized before use. |

---

## Config Resolution Flow

```
           ┌─────────────────────────────┐
           │  loadConfig() called        │
           │  on server startup          │
           └──────────┬──────────────────┘
                      │
           ┌──────────▼──────────────────┐
           │  1. Load .env file          │
           │     GIT_BASE_URL=...        │
           └──────────┬──────────────────┘
                      │
           ┌──────────▼──────────────────┐
           │  2. Load .witboost/         │
           │     config.yml              │
           │     git.baseUrl: ...        │
           └──────────┬──────────────────┘
                      │
           ┌──────────▼──────────────────┐
           │  3. Resolve gitHost:        │
           │     env GIT_BASE_URL        │
           │       ?? config git.baseUrl │
           │       ?? "gitlab.com"       │
           └──────────┬──────────────────┘
                      │
           ┌──────────▼──────────────────┐
           │  4. normalizeGitHost()      │
           │     strip scheme            │
           │     strip trailing slash    │
           │     fallback on empty       │
           └──────────┬──────────────────┘
                      │
           ┌──────────▼──────────────────┐
           │  WitboostConfig.gitHost     │
           │  passed to ToolContext      │
           │  via ctx.config.gitHost     │
           └─────────────────────────────┘
```

## URL Construction Rules

All repository URL construction in tool handlers MUST use `ctx.config.gitHost` instead of the literal string `"gitlab.com"`. The following table maps current hardcoded patterns to their replacement:

| Current (hardcoded) | Replacement |
|---------------------|-------------|
| `` `https://gitlab.com/${slug}.git` `` | `` `https://${ctx.config.gitHost}/${slug}.git` `` |
| `` `git@gitlab.com:${slug}.git` `` | `` `git@${ctx.config.gitHost}:${slug}.git` `` |
| `` `gitlab.com?owner=${encodedGroup}&repo=${repoName}` `` | `` `${ctx.config.gitHost}?owner=${encodedGroup}&repo=${repoName}` `` |
| `https:\/\/gitlab\.com\/` (regex) | `https://${escapeRegex(ctx.config.gitHost)}/` (regex-safe) |

**`escapeRegex` helper** (to implement in a shared util or inline):
```typescript
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

## Affected Files Summary

| File | Change type | Description |
|------|-------------|-------------|
| `src/config/schema.ts` | Extend | Add `gitHost: string` to `WitboostConfig`; add `git?: { baseUrl?: string }` to `RawConfigFile`; add `gitHost: "gitlab.com"` to `CONFIG_DEFAULTS` |
| `src/config/loader.ts` | Extend | Add `normalizeGitHost()` helper; resolve `gitHost` from `GIT_BASE_URL` env or `git.baseUrl` config key; pass to `buildConfig()` |
| `src/tools/repositories.ts` | Modify | Replace 3 occurrences of `gitlab.com` with `ctx.config.gitHost`; update regex |
| `src/tools/data-products.ts` | Modify | Replace 3 occurrences of `gitlab.com` with `ctx.config.gitHost`; update regex |
| `src/tools/components.ts` | Modify | Replace 2 occurrences of `gitlab.com` in URL construction; update description string |
| `config/defaults.yml` | Document | Add `git.baseUrl` commented section |
| `.env.example` | Document | Add `GIT_BASE_URL` commented entry |
| `tests/unit/config/loader.test.ts` | Extend | Add test cases for `gitHost` resolution and normalization |
