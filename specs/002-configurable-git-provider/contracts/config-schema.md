# Configuration Schema: Configurable Git Provider URL

**Phase**: 1 — Design & Contracts | **Date**: 2026-07-29 | **Plan**: [plan.md](../plan.md)

This document defines the configuration contract additions introduced by this feature. It extends the existing [config schema from spec 001](../../001-witboost-ai-toolkit/contracts/config-schema.md).

## New Environment Variable: `GIT_BASE_URL`

**Location**: `.env` file at the repository root (same file as `WITBOOST_BASE_URL`)

**Type**: String — bare hostname, optionally with port

**Required**: No — defaults to `gitlab.com` when absent or empty

**Description**: Hostname of the Git provider instance used by the Witboost toolkit to construct clone URLs and scaffold parameters. Set this when using a self-hosted GitLab instance.

**Resolution priority**: `GIT_BASE_URL` env var > `git.baseUrl` in `.witboost/config.yml` > built-in default `gitlab.com`

### Format

```
GIT_BASE_URL=<hostname>[:<port>]
```

| Valid examples | Result after normalization |
|----------------|--------------------------|
| `gitlab.com` | `gitlab.com` |
| `gitlab.mycompany.com` | `gitlab.mycompany.com` |
| `https://gitlab.mycompany.com` | `gitlab.mycompany.com` (scheme stripped) |
| `https://gitlab.mycompany.com/` | `gitlab.mycompany.com` (scheme + slash stripped) |
| `git@gitlab.mycompany.com` | `gitlab.mycompany.com` (git@ stripped) |
| `gitlab.mycompany.com:8080` | `gitlab.mycompany.com:8080` (port preserved) |
| *(empty or not set)* | `gitlab.com` (default) |

### .env.example entry

```dotenv
# Git provider hostname (no scheme, no trailing slash)
# Default: gitlab.com
# Set this when using a self-hosted GitLab instance.
# Examples: gitlab.mycompany.com  |  gitlab.mycompany.com:8080
#GIT_BASE_URL=gitlab.mycompany.com
```

---

## New Config File Key: `git.baseUrl`

**Location**: `.witboost/config.yml`

**Type**: String (optional YAML key)

**Overridden by**: `GIT_BASE_URL` environment variable (env var always wins)

**Description**: Same as `GIT_BASE_URL` but set via the config file. Useful when the toolkit is deployed in environments where environment variables are managed separately from the `.env` file.

### YAML Schema Addition

```yaml
# .witboost/config.yml (additions only — existing keys unchanged)

# Git provider configuration
git:
  # Hostname of the Git provider instance (no scheme, no trailing slash).
  # Default: gitlab.com
  # Override: GIT_BASE_URL environment variable
  # baseUrl: "gitlab.mycompany.com"
```

### Full Updated `config.yml` Schema

```yaml
# .witboost/config.yml — Witboost AI Toolkit configuration
# All fields are optional. Defaults shown in comments.

# API connection settings
api:
  baseUrl: "https://witboost.example.com"   # Override: WITBOOST_BASE_URL
  version: "v1"                              # Override: WITBOOST_API_VERSION
  timeout: 30000                             # Override: WITBOOST_API_TIMEOUT (ms)

# Git provider configuration                 ← NEW
git:
  # baseUrl: "gitlab.mycompany.com"          # Override: GIT_BASE_URL

# Project defaults
defaults:
  domain: ""           # Override: WITBOOST_DEFAULT_DOMAIN
  environment: ""      # Override: WITBOOST_DEFAULT_ENVIRONMENT

# Harness configuration
harness:
  targets: [copilot]   # Values: copilot, claude, codex, deepagents
```

---

## Updated `WitboostConfig` TypeScript Interface

```typescript
/** Validated Witboost configuration */
export interface WitboostConfig {
  baseUrl: string;
  token: string;
  wcgUrl?: string;
  defaultDomain: string;
  defaultEnvironment: string;
  apiVersion: string;
  requestTimeout: number;
  gitHost: string;   // ← NEW: bare hostname, e.g. "gitlab.com" or "gitlab.mycompany.com"
}
```

---

## Normalization Contract

The `normalizeGitHost(raw: string | undefined): string` function MUST implement the following contract:

| Input | Output |
|-------|--------|
| `undefined` or `null` | `"gitlab.com"` |
| `""` | `"gitlab.com"` |
| `"gitlab.com"` | `"gitlab.com"` |
| `"https://gitlab.mycompany.com"` | `"gitlab.mycompany.com"` |
| `"http://gitlab.mycompany.com"` | `"gitlab.mycompany.com"` |
| `"git@gitlab.mycompany.com"` | `"gitlab.mycompany.com"` |
| `"https://gitlab.mycompany.com/"` | `"gitlab.mycompany.com"` |
| `"gitlab.mycompany.com:8080"` | `"gitlab.mycompany.com:8080"` |
| `"  gitlab.mycompany.com  "` | `"gitlab.mycompany.com"` (trimmed) |

The function MUST NOT throw. Any input that reduces to an empty string after normalization MUST return `"gitlab.com"`.

---

## Impact on Existing Tool Outputs

No MCP tool input or output schemas change. The following tools produce repository URLs that will reflect the configured `gitHost` rather than the hardcoded `gitlab.com`:

| Tool | Changed output field | Old value example | New value example |
|------|---------------------|-------------------|-------------------|
| `list_repositories` | HTTPS clone URL | `https://gitlab.com/...` | `https://gitlab.mycompany.com/...` |
| `list_repositories` | SSH clone URL | `git@gitlab.com:...` | `git@gitlab.mycompany.com:...` |
| `update_data_product` | Clone URLs in response text | `https://gitlab.com/...` | `https://gitlab.mycompany.com/...` |
| `create_component` | `repoUrl` parameter (auto-derived) | `gitlab.com?owner=...` | `gitlab.mycompany.com?owner=...` |
