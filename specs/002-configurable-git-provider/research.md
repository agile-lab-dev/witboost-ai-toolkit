# Research: Configurable Git Provider URL

**Phase**: 0 — Research | **Date**: 2026-07-29 | **Plan**: [plan.md](plan.md)

## Research Questions Resolved

### 1. Where are all hardcoded `gitlab.com` references in the MCP server?

**Decision**: Three tool files contain hardcoded `gitlab.com` strings that must be parameterized.

**Findings**:

| File | Location | Hardcoded Use |
|------|----------|---------------|
| `src/tools/repositories.ts` | `extractRepoUrls()` | HTTPS and SSH URL construction from `gitlab.com/project-slug` annotation |
| `src/tools/repositories.ts` | `extractRepoUrls()` | Regex fallback parsing of `backstage.io/source-location` for `gitlab.com` host |
| `src/tools/data-products.ts` | `update_data_product` handler | HTTPS and SSH URL construction from `gitlab.com/project-slug` annotation |
| `src/tools/data-products.ts` | `update_data_product` handler | Regex fallback parsing of `backstage.io/source-location` for `gitlab.com` host |
| `src/tools/components.ts` | `create_component` handler | `repoUrl` scaffold parameter: `gitlab.com?owner=<group>&repo=<name>` |
| `src/tools/components.ts` | `create_component` handler | `repoUrl` correction when owner doesn't match DP group |
| `src/tools/components.ts` | Input schema description string | Documentation string: "repoUrl must be: `gitlab.com?owner=...`" (low priority) |

**Annotation key `gitlab.com/project-slug`**: This annotation key name is NOT a URL — it is a Backstage-standard annotation key used by GitLab-specific catalog integrations. It must NOT be made configurable in this feature. The annotation key is part of the entity's metadata in the Witboost catalog and cannot be changed by the toolkit. It remains hardcoded as the lookup key regardless of `GIT_BASE_URL`.

**Rationale**: Only the hostname strings used to build actual clone URLs and scaffold parameters need to change. Annotation key names are catalog conventions, not URLs.

---

### 2. How to thread `gitHost` through the existing config/context system

**Decision**: Add `gitHost: string` to `WitboostConfig` (resolved at server startup), and pass it to tool handlers via the existing `ToolContext.config` field. No new mechanism needed.

**Findings**: The config system already follows this exact pattern:
- `WitboostConfig` interface (`schema.ts`) holds all resolved config fields
- `buildConfig()` (`schema.ts`) validates and assembles the final config from raw inputs
- `loadConfig()` (`loader.ts`) reads env vars + YAML file and calls `buildConfig()`
- `createServer(config)` (`server/server.ts`) builds `ToolContext = { config, api }` and passes it to every tool handler as `ctx`

Adding `gitHost` follows the exact same pattern as `defaultDomain`, `defaultEnvironment`, etc. Zero architectural change required.

**Alternatives considered**: Making `gitHost` a module-level singleton (read once at import time) — rejected because it makes testing harder and violates the existing pattern where all config flows through `ToolContext`.

---

### 3. URL normalization strategy for `GIT_BASE_URL`

**Decision**: Strip scheme prefix (`https://`, `http://`, `git@`), then strip trailing slashes. Default to `gitlab.com` when result is empty or input is not provided.

**Rationale**: Users commonly paste full URLs rather than bare hostnames. Normalization must be lenient and silent (no error for the common case) to match the UX goal of zero friction.

**Edge cases handled**:
| Input | Normalized output |
|-------|------------------|
| `gitlab.com` | `gitlab.com` |
| `https://gitlab.mycompany.com` | `gitlab.mycompany.com` |
| `http://gitlab.mycompany.com` | `gitlab.mycompany.com` |
| `https://gitlab.mycompany.com/` | `gitlab.mycompany.com` |
| `git@gitlab.mycompany.com` | `gitlab.mycompany.com` |
| `gitlab.mycompany.com:8080` | `gitlab.mycompany.com:8080` (port preserved) |
| `` (empty string) | `gitlab.com` (default) |
| not set | `gitlab.com` (default) |

**Normalization function** (to implement in `loader.ts`):
```typescript
function normalizeGitHost(raw: string | undefined): string {
  if (!raw) return "gitlab.com";
  // Strip scheme prefixes
  let host = raw.replace(/^https?:\/\//, "").replace(/^git@/, "");
  // Strip trailing slashes
  host = host.replace(/\/+$/, "").trim();
  return host || "gitlab.com";
}
```

**Alternatives considered**:
- Using `new URL(raw)` to parse — rejected because it requires a scheme and throws on bare hostnames like `gitlab.com`; the regex approach is simpler and handles all cases.
- Logging a warning when normalization modifies the input — deferred; not in scope for this feature.

---

### 4. How the `repoUrl` scaffold parameter format works with the configurable hostname

**Decision**: The `repoUrl` format used by the Backstage scaffolder is `<hostname>?owner=<group>&repo=<name>`. The `<hostname>` portion is currently hardcoded as `gitlab.com` — it must be replaced with `ctx.config.gitHost`.

**Findings**: The `repoUrl` parameter is a Backstage scaffolder-specific format where the hostname acts as a provider identifier. Self-hosted GitLab instances use the same format with their custom hostname. This is confirmed by Backstage docs and is the reason why simply changing the hostname is sufficient for self-hosted GitLab.

**Important**: GitHub uses a different format (`github.com?owner=<org>&repo=<name>`) and Bitbucket uses yet another. However, the Witboost scaffold templates in the catalog are typically configured for GitLab. Switching `GIT_BASE_URL` to a non-GitLab hostname would require the Witboost scaffold templates themselves to be updated, which is out of scope. The spec explicitly scopes this feature to self-hosted GitLab instances.

---

### 5. Whether regex patterns for `backstage.io/source-location` parsing need updating

**Decision**: Yes — the fallback regex in `repositories.ts` and `data-products.ts` that parses `backstage.io/source-location` annotations currently matches only `https://gitlab.com/...`. This regex must be updated to use the configured `gitHost`.

**Findings**: Source location annotations look like:
```
url:https://gitlab.mycompany.com/finance/storage.git
```
The current regex `https:\/\/gitlab\.com\/...` would fail to match self-hosted URLs. It must use the configured hostname (URL-escaped for regex safety).

**Implementation**: Use `escapeRegex(ctx.config.gitHost)` before constructing the pattern, where `escapeRegex` escapes dots and special chars for regex safety.

---

## Decisions Summary

| Decision | Chosen | Rationale |
|----------|--------|-----------|
| Config field name | `gitHost` in `WitboostConfig` | Consistent naming (plain noun, not `gitBaseUrl`) |
| Env var name | `GIT_BASE_URL` | Matches user request; parallel to `WITBOOST_BASE_URL` |
| Config-file key | `git.baseUrl` under `.witboost/config.yml` | Matches env var naming, natural YAML grouping |
| Default value | `gitlab.com` | Backward-compatible; no breakage for existing users |
| Annotation key scope | Not configurable | `gitlab.com/project-slug` is a catalog annotation key, not a URL |
| Normalization | Strip scheme + trailing slash, default on empty | Lenient; handles all common user inputs |
| Regex fallback | Use configured hostname, escaped for regex | Consistent URL parsing regardless of host |
| Non-GitLab support | Out of scope | Scaffold templates are GitLab-specific |
