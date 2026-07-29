# Quickstart: Configurable Git Provider URL

**Phase**: 1 — Design | **Date**: 2026-07-29 | **Plan**: [plan.md](plan.md)

This guide describes how to validate that the configurable Git provider feature works end-to-end, covering both the self-hosted GitLab scenario and the default backward-compatibility scenario.

## Prerequisites

- The MCP server is built (`npm run build` from the repo root)
- A `.env` file exists at the repository root (copy from `.env.example`)
- `WITBOOST_BASE_URL` and `WITBOOST_TOKEN` are set in `.env`
- A Witboost catalog entity exists with known repository annotations

## Scenario 1: Self-Hosted GitLab (Primary Flow)

### Setup

1. Open `.env` and add:
   ```dotenv
   GIT_BASE_URL=gitlab.mycompany.com
   ```
2. (Re)start the MCP server — configuration is read once at startup.

### Validation Steps

**Step 1 — Verify config loads correctly**

Run the unit tests for the config loader:
```bash
npm test -- --reporter=verbose tests/unit/config/loader.test.ts
```
Expected: all tests pass, including the new `gitHost` resolution tests.

**Step 2 — Call `list_repositories` via the MCP client**

In your AI agent chat (e.g., VS Code Copilot with the MCP server registered):
```
Call list_repositories for data product: <your-dp-id>
```

Expected response structure:
```
Repositories (N):

- **<dp-name>**
  HTTPS: https://gitlab.mycompany.com/<group>/<repo>.git
  SSH: git@gitlab.mycompany.com:<group>/<repo>.git
  Entity: system:default/<dp-id>
```

Verify: URLs contain `gitlab.mycompany.com`, not `gitlab.com`.

**Step 3 — Verify `create_component` derives the correct `repoUrl`**

In agent chat (do NOT actually scaffold — just check the parameters logged):
```
Show me the parameters that would be used to create a component named "test-comp"
for data product <your-dp-id> using blueprint <blueprint-name>
```

Expected: the `repoUrl` parameter in the task payload contains `gitlab.mycompany.com?owner=<group>&repo=testcomp`.

Verify: hostname is `gitlab.mycompany.com`, not `gitlab.com`.

---

## Scenario 2: Default Fallback (Backward Compatibility)

### Setup

1. Open `.env` and ensure `GIT_BASE_URL` is **not set** (comment it out or remove it).
2. (Re)start the MCP server.

### Validation Steps

**Step 1 — Run unit tests**

```bash
npm test -- --reporter=verbose tests/unit/config/loader.test.ts
```

Expected: the `gitHost` default test passes — `gitHost` is `"gitlab.com"` when `GIT_BASE_URL` is not set.

**Step 2 — Call `list_repositories`**

Expected: URLs use `gitlab.com` — identical to pre-feature behavior.

---

## Scenario 3: Input Normalization

### Setup

Test each of these values for `GIT_BASE_URL` in `.env`, restart the server, and verify `list_repositories` returns URLs with the normalized hostname:

| `GIT_BASE_URL` value | Expected hostname in URLs |
|----------------------|--------------------------|
| `https://gitlab.mycompany.com` | `gitlab.mycompany.com` |
| `https://gitlab.mycompany.com/` | `gitlab.mycompany.com` |
| `git@gitlab.mycompany.com` | `gitlab.mycompany.com` |
| `gitlab.mycompany.com:8080` | `gitlab.mycompany.com:8080` |
| `` (empty) | `gitlab.com` |

---

## Scenario 4: Config File Override

### Setup

1. In `.env`, do NOT set `GIT_BASE_URL`.
2. In `.witboost/config.yml`, add:
   ```yaml
   git:
     baseUrl: "gitlab.mycompany.com"
   ```
3. Restart the MCP server.

### Validation

Call `list_repositories` — expected URLs contain `gitlab.mycompany.com`, confirming the config file is read.

Then set `GIT_BASE_URL=gitlab.other.com` in `.env` and restart — expected URLs now contain `gitlab.other.com`, confirming the env var takes priority over the config file.

---

## References

- Config schema: [contracts/config-schema.md](contracts/config-schema.md)
- Data model: [data-model.md](data-model.md)
- Affected source files: `src/tools/repositories.ts`, `src/tools/data-products.ts`, `src/tools/components.ts`, `src/config/schema.ts`, `src/config/loader.ts`
