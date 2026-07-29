# Feature Specification: Configurable Git Provider URL

**Feature Branch**: `002-configurable-git-provider`

**Created**: 2026-07-29

**Status**: Draft

**Input**: User description: "Right now this toolkit works only for gitlab as git provider. We want to generalize it and let the user write the git url in the .env file. Gitlab can be used as a default fallback."

## Clarifications

### Session 2026-07-29

- Q: When `backstage.io/source-location` is used as the fallback for clone URLs (no `gitlab.com/project-slug` slug), should the annotation URL be used verbatim or parsed and reconstructed using `gitHost`? → A: Use the annotation URL directly (strip `url:` prefix only). No regex parsing, no URL reconstruction. `gitHost` applies only to URLs the toolkit constructs itself (from slug annotation or scaffold `repoUrl`).
- Q: If `GIT_BASE_URL` contains a path component (e.g., `myserver.com/gitlab`), should normalization strip the path silently, use as-is, or strip with a warning? → A: Use as-is. After scheme-prefix and trailing-slash stripping, the remaining value (including any path) is accepted without modification. Sub-path installations are out of scope; behaviour with a path component is undefined and the user's responsibility.
- Q: Should the annotation key lookup for project slugs be generalized beyond the hardcoded `gitlab.com/project-slug` key, and if so, which host is used for URL construction? → A: Yes — search all entity annotations for any key ending in `/project-slug` (e.g., `gitlab.com/project-slug`, `github.com/project-slug`, `gitlab.mycompany.com/project-slug`). The configured `gitHost` (from `GIT_BASE_URL`) is always used for URL construction regardless of which annotation key prefix matched.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Self-Hosted Git Instance (Priority: P1)

A developer whose organization runs a self-hosted GitLab instance (e.g., `gitlab.mycompany.com`) sets their Git base URL in the `.env` file. The toolkit then constructs all repository URLs using that hostname instead of `gitlab.com`. Clone URLs, source locations, and scaffolding repo references all point to the correct internal host.

**Why this priority**: This is the primary blocker for any organization that does not use `gitlab.com` as their Git provider. Without it, the toolkit silently produces wrong URLs for all repository operations.

**Independent Test**: A developer sets `GIT_BASE_URL=gitlab.mycompany.com` in `.env`, then calls the `list_repositories` tool. The returned HTTPS and SSH clone URLs MUST use `gitlab.mycompany.com` as the hostname. This can be tested with no other features enabled and delivers full value for on-premise GitLab users.

**Acceptance Scenarios**:

1. **Given** a `.env` file with `GIT_BASE_URL=gitlab.mycompany.com`, **When** the MCP server starts, **Then** all internal URL construction uses `gitlab.mycompany.com` as the Git host.
2. **Given** `GIT_BASE_URL=gitlab.mycompany.com`, **When** a user calls `list_repositories` for a data product, **Then** the returned HTTPS URL is `https://gitlab.mycompany.com/<slug>.git` and the SSH URL is `git@gitlab.mycompany.com:<slug>.git`.
3. **Given** `GIT_BASE_URL=gitlab.mycompany.com`, **When** the scaffold tool constructs a `repoUrl` parameter, **Then** the `repoUrl` uses `gitlab.mycompany.com` as its host segment.
4. **Given** `GIT_BASE_URL=gitlab.mycompany.com`, **When** the `get_data_product_details` tool extracts the source location from a `backstage.io/source-location` annotation, **Then** URLs containing `gitlab.mycompany.com` are parsed correctly.

---

### User Story 2 - Default Fallback to GitLab.com (Priority: P2)

A developer using the public `gitlab.com` SaaS does **not** set `GIT_BASE_URL`. The toolkit behaves exactly as before: all URLs default to `gitlab.com`. No migration or reconfiguration is required for existing users.

**Why this priority**: Backward compatibility is critical. Existing users must not be broken by this change. A clean default ensures zero disruption.

**Independent Test**: A developer with no `GIT_BASE_URL` in their `.env` calls `list_repositories`. The returned URLs MUST use `gitlab.com` as the hostname, identical to the current behavior.

**Acceptance Scenarios**:

1. **Given** no `GIT_BASE_URL` in `.env` or environment, **When** the MCP server starts, **Then** the Git host defaults to `gitlab.com`.
2. **Given** `GIT_BASE_URL` is set to an empty string, **When** the MCP server starts, **Then** the Git host defaults to `gitlab.com` (empty value treated as unset).
3. **Given** no `GIT_BASE_URL`, **When** any tool returns repository URLs, **Then** the URLs are identical to the current hardcoded `gitlab.com` behavior.

---

### User Story 3 - Visible Configuration in Docs and Config Schema (Priority: P3)

A developer reads the toolkit documentation or `.witboost/config.yml` and discovers how to configure the Git provider URL. The option is clearly described with its default value, expected format, and examples for both SaaS and self-hosted scenarios.

**Why this priority**: Discoverability ensures users can self-serve without support. Without clear documentation, the feature may go unused even after implementation.

**Independent Test**: The config schema document and the sample `.env` file both include `GIT_BASE_URL` with a description and example. A user can configure the toolkit correctly by reading the documentation alone.

**Acceptance Scenarios**:

1. **Given** the config schema documentation, **When** a developer looks for Git configuration options, **Then** `GIT_BASE_URL` is listed with its default (`gitlab.com`), expected format (hostname only, no scheme), and examples.
2. **Given** the sample `.env` or `.witboost/config.yml` template, **When** a developer opens it, **Then** the `GIT_BASE_URL` entry is present (commented out by default) with an explanatory comment.

---

### Edge Cases

- What happens when `GIT_BASE_URL` contains a scheme prefix (e.g., `https://gitlab.mycompany.com`)? The system must strip the scheme and use only the hostname to avoid double-`https://` in constructed URLs.
- What happens when `GIT_BASE_URL` has a trailing slash? The system must normalize it by stripping trailing slashes.
- What happens when `GIT_BASE_URL` contains a path component (e.g., `myserver.com/gitlab`)? The value is accepted as-is after scheme-prefix and trailing-slash stripping. Sub-path installations are out of scope; no error or warning is produced — the resulting URL behaviour is the user's responsibility.
- What happens when a `backstage.io/source-location` annotation references a URL with a different host than `GIT_BASE_URL`? The system uses the annotation URL verbatim (stripping the `url:` prefix only) — no regex parsing, no reconstruction with `gitHost`. The annotation is authoritative and already contains the correct host as written by the catalog ingestion process.
- What happens when `GIT_BASE_URL` points to a non-GitLab provider (e.g., GitHub)? Annotation key parsing (e.g., `gitlab.com/project-slug`) may not match. The system falls back to `backstage.io/source-location` for URL extraction (used verbatim).
- What happens when multiple annotations on the same entity match the `*/project-slug` pattern (e.g., both `gitlab.com/project-slug` and `github.com/project-slug` exist)? The first matching key found during annotation map iteration is used; subsequent matches are ignored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MCP server MUST read the Git base hostname from an environment variable named `GIT_BASE_URL`.
- **FR-002**: When `GIT_BASE_URL` is not set or is empty, the system MUST use `gitlab.com` as the default Git hostname (backward-compatible fallback).
- **FR-003**: The system MUST strip any `https://`, `http://`, or `git@` prefix from `GIT_BASE_URL` if provided by the user, normalizing to a bare hostname.
- **FR-004**: The system MUST strip trailing slashes from `GIT_BASE_URL` after normalization. Path components (if any) are preserved as-is — normalization is limited to scheme prefix and trailing slashes only.
- **FR-005**: All repository URL construction (HTTPS clone URL, SSH clone URL, `repoUrl` scaffold parameter) MUST use the resolved Git hostname from `GIT_BASE_URL`.
- **FR-006**: The `backstage.io/source-location` annotation value MUST be used as the authoritative source for clone URLs when the primary `gitlab.com/project-slug` annotation is absent. The annotation URL MUST be used verbatim (stripping the `url:` prefix only) — the system MUST NOT apply regex parsing or reconstruct URLs using `gitHost`. This applies regardless of whether the annotation host matches `GIT_BASE_URL`.
- **FR-007**: The `GIT_BASE_URL` setting MUST be documented in the config schema (`contracts/config-schema.md`) and in the `.witboost/` template files.
- **FR-008**: Existing `.witboost/config.yml` configurations without a `GIT_BASE_URL` entry MUST continue to work without any changes.
- **FR-009**: The `GIT_BASE_URL` value MUST also be configurable via `.witboost/config.yml` under a `git.baseUrl` key, following the existing layered config resolution order (env var overrides config file).
- **FR-010**: The system MUST locate the project slug by searching all entity annotations for a key matching the pattern `*/project-slug` (any host prefix followed by `/project-slug`). The first matching annotation value MUST be used as the project path. The configured `gitHost` MUST be used to construct all clone URLs regardless of which annotation key prefix was matched. This applies in all tools that currently hardcode `"gitlab.com/project-slug"` as the annotation key (`repositories.ts`, `data-products.ts`, `components.ts`).

### Key Entities

- **Git Hostname**: The bare hostname string used to construct all Git URLs (e.g., `gitlab.com`, `gitlab.mycompany.com`). Resolved once at server startup from environment or config; defaults to `gitlab.com`.
- **Repository URL**: An HTTPS or SSH clone URL constructed from the Git hostname and a project path/slug. Format: `https://<hostname>/<path>.git` (HTTPS) and `git@<hostname>:<path>.git` (SSH).
- **Repo URL Parameter**: The scaffold-specific `repoUrl` string format used by Backstage scaffolder: `<hostname>?owner=<group>&repo=<name>`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers on self-hosted GitLab instances can configure their instance URL and receive correct repository URLs from all MCP tools — verifiable by setting `GIT_BASE_URL` to a custom hostname and observing correct output.
- **SC-002**: Zero behavior change for existing users who do not set `GIT_BASE_URL` — all URLs continue to use `gitlab.com` as before.
- **SC-003**: The configuration option is discoverable without external help — a developer can find and apply `GIT_BASE_URL` by reading only the provided documentation.
- **SC-004**: URL normalization handles the 3 most common misconfiguration formats (with scheme, with trailing slash, with both) without error or incorrect output.

## Assumptions

- The primary use case is self-hosted GitLab instances, but the project slug annotation is matched by pattern (`*/project-slug`) rather than by hardcoded key, making the toolkit catalog-compatible with any Git provider that follows the `<provider>/project-slug` annotation convention (e.g., `github.com/project-slug`, `gitlab.mycompany.com/project-slug`).
- `GIT_BASE_URL` represents only the hostname (and optional port), not a full URL path prefix. Sub-path installations (e.g., `myserver.com/gitlab`) are out of scope.
- The `.env` file is the primary configuration mechanism for the git URL, consistent with how `WITBOOST_BASE_URL` and `WITBOOST_TOKEN` are currently configured.
- All repository URL formats used in the codebase follow the same `<hostname>/<path>` structure, making a single configurable hostname sufficient to cover all cases.
- Port numbers in `GIT_BASE_URL` (e.g., `gitlab.mycompany.com:8080`) should be preserved as-is after scheme stripping.
