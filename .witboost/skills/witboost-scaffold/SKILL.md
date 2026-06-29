---
name: witboost-scaffold
description: Create data products and components via the scaffolder — naming conventions, identifier formats, template parameters, skeleton rules
tools:
  - create_data_product
  - add_component
  - update_data_product
  - delete_data_product
  - remove_component
---

# Witboost Scaffolding & Conventions

## Identifier Formats

### Data Product Identifier

| Template | Identifier Format | Example |
|---|---|---|
| `dataproduct-template` | `domain.dp-name.version` | `finance.spend-analytics.0` |
| `dataproduct-template-skeleton` | `dp-name` (short) | `spend-analytics` |

**Rule**: Check the template schema. If the identifier field has `ui:field: IdentifierPicker`, the platform auto-generates it. Pass the fully qualified format for `dataproduct-template`.

### Component Identifier

Components **must** use fully qualified identifiers in `metadata.name`:

```
domain.dp-name.version.component-name
```

The URN is derived by replacing dots with colons:
`urn:dmb:cmp:finance:spend-analytics:0:payment-scoring`

**Never** use a short name alone — it produces an invalid URN.

**IMPORTANT**: The scaffolder `identifier` parameter accepts the **short** name (e.g. `b2b-credit-scores`),
but the generated `metadata.name` in `catalog-info.yaml` MUST be the **fully qualified** form.

## Reserved / Immutable Fields

These fields are set by the Witboost processor at **first ingestion** and can **NEVER** be changed:

| Field | Source | Scope |
|---|---|---|
| `projectOwner` | Computed from `dataProductOwner` at first ingestion | DP only |
| `ownerGroup` | Computed from `dataProductOwner` at first ingestion | DP only |
| `projectOwnerDisplayName` | Computed from `dataProductOwner` at first ingestion | DP only |
| Component `spec.owner` | Inherited from parent DP's `projectOwner` | Components |

**If `dataProductOwner` is wrong at creation time, the data product is permanently broken.**

### Owner Field Rules

- **NEVER guess** the `dataProductOwner` value. Omit it — the tool auto-resolves it from the authenticated user.
- User ref format: `user:FIRST.LAST_DOMAIN.TLD` (from email), NOT `user:FIRST_LAST`.

## Template Parameter Names

Different templates use different field names for the same concept:

| Concept | `dataproduct-template` | `dataproduct-template-skeleton` |
|---|---|---|
| Dev group | `devGroup` | `developmentGroup` |
| Maturity values | `Proposed` (only) | `Tactical`, `Strategic` |

### Component Template Extra Fields

Component templates may need these **auto-derived** fields:

- `domainName`: Human-readable domain name (e.g. `"Finance"`)
- `dataproductName`: Human-readable DP name (e.g. `"Spend Analytics"`)

### fullyQualifiedName Format

```
Domain - DP Title - version N - Component Title
```

Example: `Finance - B2B Credit - version 0 - B2B Credit Scores`

### Analyzing Templates Before Use

**Always fetch and analyze the template schema** before calling the scaffolder. Look for:

1. **Field types**: `type: "object"` → pass an object, not a string
2. **Dependencies**: `ui:filter` and `source` annotations
3. **Required fields**: Each step has a `required` array
4. **Validation rules**: `pattern`, `enum`, `minLength`, `maxLength`

### Component Dependency Order

Create components in dependency order (storage → workload → output port).
Derive order from `dependsOn` in the template schema.

## Skeleton vs Plain Entities

Before editing a component's `catalog-info.yaml`, check the first line:

- Starts with `%SKELETON` → It's a Nunjucks template. **Edit `parameters.yaml` instead**.
- Plain YAML → Edit `catalog-info.yaml` directly.

## YAML Safety in Template Parameters

Values containing special YAML characters break Nunjucks rendering:

| Character | Problem | Fix |
|---|---|---|
| `:` (colon) | Creates nested YAML mapping | Rephrase without colons |
| `#` (hash) | YAML comment | Avoid or quote |
| `- ` (dash-space) | YAML list item | Rephrase |

## RepoUrl Format

```
gitlab.com?owner=<url-encoded-group-path>&repo=<RepoName>
```

**Rules**: `owner` is GitLab group path with `/` encoded as `%2F`. `repo` is PascalCase, no spaces.

## GitLab Scaffolder Repos

Repos created by the scaffolder may have a broken HEAD (`ref: refs/heads/.invalid`).
Fix with: `git symbolic-ref HEAD refs/heads/master`

## Known Template Issues

Some templates may have platform-specific bugs. **Always verify a template before using it.**

| Symptom | Likely cause | Workaround |
|---|---|---|
| `rootDirectory: .` produces `//catalog-info.yaml` → 400 Bad Request | Template generates double-slash path | Set `rootDirectory` to empty string, or use an alternative template |
| `starting (root) group "XYZ" is not found` | Template hardcodes a Git group that doesn't exist on this platform | **Do NOT use this template** — it's misconfigured for this instance |

**Before using a template**, check if it references a Git group that exists on the target platform. If unsure, look at existing data products' `repoUrl` to find the correct group path.

## Error Recovery

### Failed scaffolding leaves stale repos

When the scaffolder fails **after** creating the repository but **before** completing, the repo remains on the Git server. Subsequent retries will fail with:

> "the specified path '.' of the repository is not empty"

**Recovery steps:**
1. **Do NOT retry with the same repo name** — it will fail again
2. Either delete the stale repo manually, or use a different repo name
3. Check `list_repositories` for the data product to see what already exists

### Common failure → fix mapping

| Error message | Cause | Fix |
|---|---|---|
| `path '.' is not empty` | Repo exists from a previous failed attempt | Delete the stale repo or use a different name |
| `//catalog-info.yaml` / `%2Fcatalog-info.yaml` | Template bug with `rootDirectory` | Use a different template (see Known Template Issues) |
| `starting (root) group "XYZ" is not found` | Template hardcodes a wrong Git group | **Do NOT use this template** — it's misconfigured for this platform |
| `Unable to create the new ... repository. 400` | Repo name collision | Change the repo name |

## Snowflake Provisioner

Allowed `dataType` values: `TEXT`, `NUMBER`, `DATE`, `BOOLEAN`, `FLOAT`, `DOUBLE`.
NOT allowed: `VARCHAR`, `TIMESTAMP`, `INT`.
