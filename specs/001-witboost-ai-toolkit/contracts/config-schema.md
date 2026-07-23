# Configuration Schema: Witboost AI Toolkit

**Phase**: 1 — Design & Contracts | **Date**: 2026-06-14

## File Location

`.witboost/config.yml` in the target repository root.

## Resolution Order

Configuration is resolved in layers (later layers win):

1. **Built-in defaults** — hardcoded in the MCP server source
2. **Project config** — `.witboost/config.yml` in the repository
3. **Environment variables** — override any config value

## Schema

```yaml
# .witboost/config.yml — Witboost AI Toolkit configuration
# All fields are optional. Defaults shown in comments.

# API connection settings
api:
  # Base URL of the Witboost platform (REQUIRED via env var if not set here)
  # Override: WITBOOST_BASE_URL
  baseUrl: "https://witboost.example.com"

  # API version prefix
  # Default: "v1"
  version: "v1"

  # Request timeout in milliseconds
  # Default: 30000
  timeout: 30000

# Project defaults
defaults:
  # Default domain for new data products
  domain: ""

  # Default environment for deployments
  environment: ""

# Harness configuration
harness:
  # Which harness(es) to generate files for
  # Values: copilot, claude, codex
  # Default: [copilot]
  targets:
    - copilot

# Agent settings
agents:
  # Include custom agents from .witboost/agents/custom/
  # Default: true
  includeCustom: true
```

## Environment Variable Mapping

| Config Path | Environment Variable | Required |
|-------------|---------------------|----------|
| `api.baseUrl` | `WITBOOST_BASE_URL` | ✅ (must be set in config or env) |
| — | `WITBOOST_TOKEN` | ✅ (env var only — never in config files) |
| `api.version` | `WITBOOST_API_VERSION` | ❌ |
| `api.timeout` | `WITBOOST_API_TIMEOUT` | ❌ |
| `defaults.domain` | `WITBOOST_DEFAULT_DOMAIN` | ❌ |
| `defaults.environment` | `WITBOOST_DEFAULT_ENVIRONMENT` | ❌ |

## Validation Rules

- `api.baseUrl`: Must be a valid URL with `http://` or `https://` scheme. Trailing slashes are stripped.
- `api.version`: Must match pattern `^v\d+$`.
- `api.timeout`: Must be a positive integer (milliseconds).
- `harness.targets`: Array of supported harness identifiers. Invalid values produce a warning (not an error).
- `WITBOOST_TOKEN` is **never** read from config files — only from the environment variable. This enforces the security principle of not storing credentials in committed files.

## Setup Script CLI

```
node .witboost/setup.js [options]

Options:
  --harness <name>    Generate files for a specific harness (default: from config)
  --dry-run           Show what files would be generated without writing them
  --force             Overwrite existing files without prompting
  --config <path>     Path to config file (default: .witboost/config.yml)
  --help              Show help
```

**Exit codes**:
- `0` — success
- `1` — configuration error (missing required values)
- `2` — generation error (template rendering failed)
