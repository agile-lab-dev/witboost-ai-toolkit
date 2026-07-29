# Tasks: Configurable Git Provider URL

**Input**: Design documents from `specs/002-configurable-git-provider/`

**Prerequisites**: [plan.md](plan.md) ✅ | [spec.md](spec.md) ✅ | [research.md](research.md) ✅ | [data-model.md](data-model.md) ✅ | [contracts/config-schema.md](contracts/config-schema.md) ✅ | [quickstart.md](quickstart.md) ✅

**Tests**: Not explicitly requested — no test tasks generated unless marked.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story label (US1, US2, US3)
- All paths are relative to `.witboost/mcp-server/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new files or tooling required — this is a targeted edit to an existing TypeScript MCP server. Setup consists of understanding the current config wiring.

- [X] T001 Verify all hardcoded `gitlab.com` occurrences by running `grep -r "gitlab\.com" .witboost/mcp-server/src/tools/` — confirm matches in `repositories.ts`, `data-products.ts`, and `components.ts` only (no other tool files affected)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the config system with `gitHost` — this MUST be complete before any tool file can be updated.

**⚠️ CRITICAL**: All US1, US2, and US3 implementation tasks depend on this phase.

- [X] T002 Add `gitHost: string` field to the `WitboostConfig` interface in `.witboost/mcp-server/src/config/schema.ts`
- [X] T003 Add `git?: { baseUrl?: string }` optional section to the `RawConfigFile` interface in `.witboost/mcp-server/src/config/schema.ts`
- [X] T004 Add `gitHost: "gitlab.com"` to the `CONFIG_DEFAULTS` object in `.witboost/mcp-server/src/config/schema.ts`
- [X] T005 Add `normalizeGitHost(raw: string | undefined): string` helper function in `.witboost/mcp-server/src/config/loader.ts` — strips `https://`, `http://`, `git@` prefixes and trailing slashes; returns `"gitlab.com"` for empty/undefined input
- [X] T006 Resolve `gitHost` in the `loadConfig()` function body in `.witboost/mcp-server/src/config/loader.ts` — read from `env.GIT_BASE_URL ?? fileConfig.git?.baseUrl`, pass through `normalizeGitHost()`, assign to local variable `gitHost`
- [X] T007 Pass `gitHost` to `buildConfig()` call in `.witboost/mcp-server/src/config/loader.ts` and include it in the `buildConfig` raw params and return value in `.witboost/mcp-server/src/config/schema.ts`

**Checkpoint**: `WitboostConfig.gitHost` is resolved at startup and available via `ctx.config.gitHost` in every tool handler — proceed to US1.

---

## Phase 3: User Story 1 - Configure Self-Hosted Git Instance (Priority: P1) 🎯 MVP

**Goal**: Replace all hardcoded `gitlab.com` hostname strings in tool handlers with `ctx.config.gitHost` so that HTTPS clone URLs, SSH clone URLs, scaffold `repoUrl` parameters, and source-location regex parsing all use the configured hostname.

**Independent Test**: Set `GIT_BASE_URL=gitlab.mycompany.com` in `.env`, start the MCP server, call `list_repositories` — all returned URLs MUST contain `gitlab.mycompany.com`. See [quickstart.md — Scenario 1](quickstart.md).

### Implementation for User Story 1

- [X] T008 [P] [US1] In `extractRepoUrls()` in `.witboost/mcp-server/src/tools/repositories.ts`: add `gitHost` parameter, replace `` `https://gitlab.com/${slug}.git` `` with `` `https://${gitHost}/${slug}.git` `` and `` `git@gitlab.com:${slug}.git` `` with `` `git@${gitHost}:${slug}.git` ``
- [X] T009 [P] [US1] In `extractRepoUrls()` in `.witboost/mcp-server/src/tools/repositories.ts`: replace the hardcoded `gitlab\.com` regex with a dynamic pattern using `escapeRegex(gitHost)` — add a local `escapeRegex(s: string): string` helper that escapes regex-special characters
- [X] T010 [US1] Update all call sites of `extractRepoUrls()` in `.witboost/mcp-server/src/tools/repositories.ts` to pass `ctx.config.gitHost` as the argument
- [X] T011 [P] [US1] In the `update_data_product` handler in `.witboost/mcp-server/src/tools/data-products.ts`: replace `` `https://gitlab.com/${slug}.git` `` with `` `https://${ctx.config.gitHost}/${slug}.git` `` and `` `git@gitlab.com:${slug}.git` `` with `` `git@${ctx.config.gitHost}:${slug}.git` ``
- [X] T012 [P] [US1] In the `update_data_product` handler in `.witboost/mcp-server/src/tools/data-products.ts`: replace the hardcoded `gitlab\.com` fallback regex with a dynamic pattern using `escapeRegex(ctx.config.gitHost)` — add or import the same `escapeRegex` helper
- [X] T013 [P] [US1] In the `create_component` handler in `.witboost/mcp-server/src/tools/components.ts`: replace both occurrences of `` `gitlab.com?owner=${encodedGroup}&repo=${repoName}` `` and the `repoUrl` correction line with `` `${ctx.config.gitHost}?owner=${encodedGroup}&repo=${repoName}` ``
- [X] T014 [US1] Update the `parameters.repoUrl` description string in the `create_component` inputSchema in `.witboost/mcp-server/src/tools/components.ts` from `"repoUrl must be: gitlab.com?owner=..."` to `"repoUrl must be: <gitHost>?owner=<encoded-group>&repo=<RepoName> where <gitHost> is your configured Git provider hostname (e.g. gitlab.com)"`

**Checkpoint**: With `GIT_BASE_URL=gitlab.mycompany.com`, `list_repositories` returns `https://gitlab.mycompany.com/...` URLs. `create_component` auto-derives `repoUrl` as `gitlab.mycompany.com?owner=...`. User Story 1 is fully functional and testable.

---

## Phase 4: User Story 2 - Default Fallback to GitLab.com (Priority: P2)

**Goal**: Verify that all changes in Phase 2 and Phase 3 default to `gitlab.com` when `GIT_BASE_URL` is not set, preserving 100% backward compatibility for existing users.

**Independent Test**: Remove `GIT_BASE_URL` from `.env` (or leave it unset), start the MCP server, call `list_repositories` — all returned URLs MUST contain `gitlab.com` identical to current behavior. See [quickstart.md — Scenario 2](quickstart.md).

### Implementation for User Story 2

- [X] T015 [US2] Add unit tests for `normalizeGitHost()` in `.witboost/mcp-server/tests/unit/config/loader.test.ts` covering: undefined input → `"gitlab.com"`, empty string → `"gitlab.com"`, bare hostname → unchanged, `https://` prefix → stripped, `http://` prefix → stripped, `git@` prefix → stripped, trailing slash → stripped, port number → preserved
- [X] T016 [US2] Add unit test cases to `.witboost/mcp-server/tests/unit/config/loader.test.ts` asserting that `loadConfig()` sets `config.gitHost` to `"gitlab.com"` when `GIT_BASE_URL` is absent from env and config file
- [X] T017 [US2] Add unit test case to `.witboost/mcp-server/tests/unit/config/loader.test.ts` asserting that `loadConfig()` sets `config.gitHost` from `GIT_BASE_URL` env var (e.g. `"gitlab.mycompany.com"`) when set
- [X] T018 [US2] Add unit test case to `.witboost/mcp-server/tests/unit/config/loader.test.ts` asserting that `GIT_BASE_URL` env var takes priority over `git.baseUrl` in `config.yml`
- [X] T019 [US2] Run the full unit test suite with `npm test` from the repo root to confirm all existing tests still pass and new tests pass

**Checkpoint**: `npm test` is green. Default behavior is verified by tests. Existing users are unaffected.

---

## Phase 5: User Story 3 - Visible Configuration in Docs (Priority: P3)

**Goal**: Ensure `GIT_BASE_URL` is discoverable from the config files that developers read first — `.env.example` and `config/defaults.yml`.

**Independent Test**: A developer opens `.env.example` and `config/defaults.yml` and can find and understand `GIT_BASE_URL` without any additional documentation. See [quickstart.md — Scenario 3 & 4](quickstart.md).

### Implementation for User Story 3

- [X] T020 [P] [US3] Add `GIT_BASE_URL` commented entry to `.env.example` at the repository root with format, default, and self-hosted example in the comment block
- [X] T021 [P] [US3] Add `git.baseUrl` commented section to `config/defaults.yml` (the shipped template that is copied to `.witboost/config.yml` during setup) with default value, env var override name, and example

**Checkpoint**: `.env.example` and `config/defaults.yml` both document `GIT_BASE_URL` / `git.baseUrl`. User Story 3 is complete and independently verifiable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all changes.

- [X] T022 Run `npm run build` from the repo root to confirm the TypeScript compiler accepts all changes with zero errors
- [X] T023 [P] Run `npm run lint` (or `npx biome check`) from the repo root to confirm no linting violations were introduced
- [X] T024 Run the full quickstart validation from [quickstart.md](quickstart.md) — Scenarios 1 through 4 — to confirm end-to-end correctness

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories. Must be complete before T008–T021.
- **Phase 3 (US1)**: Depends on Phase 2 — T008–T013 can run in parallel (different files); T014 depends on T013 context
- **Phase 4 (US2)**: Depends on Phase 2 — test tasks T015–T018 can be written any time after Phase 2; T019 requires T008–T018 all done
- **Phase 5 (US3)**: Depends on Phase 2 — T020 and T021 are independent of US1/US2 implementation and can run in parallel
- **Phase 6 (Polish)**: Depends on Phases 3, 4, 5 all complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational (Phase 2)
- **US2 (P2)**: Depends only on Foundational (Phase 2) — test file can be written in parallel with US1 tool edits
- **US3 (P3)**: Depends only on Foundational (Phase 2) — pure documentation, fully parallel with US1 and US2

### Critical Path

```
T001 → T002 → T003 → T004 → T005 → T006 → T007
                                              ↓
                                   T008,T009 (parallel)
                                              ↓
                                            T010
                                              ↓
                              T011,T012,T013 (parallel)
                                              ↓
                                            T014
                                              ↓
                                   T015–T018 (parallel)
                                              ↓
                                            T019
                                              ↓
                                   T022 → T023 → T024
```

### Parallel Opportunities

Within Phase 3 (US1): T008 + T009 (both in `repositories.ts`, no dependency between them) can be done together; T011 + T012 (both in `data-products.ts`) can be done together; T013 is independent of T011/T012.

Within Phase 4 (US2): T015, T016, T017, T018 (all in the same test file, different `it()` blocks) can be written in any order.

Within Phase 5 (US3): T020 (`.env.example`) and T021 (`config/defaults.yml`) are in different files — fully parallel.

---

## Parallel Example: User Story 1

One developer can work the `repositories.ts` changes (T008 → T009 → T010) while another works `data-products.ts` (T011 → T012) and a third works `components.ts` (T013 → T014) — all three files are independent of each other.

---

## Implementation Strategy

**MVP scope** (deliver maximum value first): **Phase 2 + Phase 3 (US1)** — config system extension + tool file hostname replacement. This is the minimum to make the toolkit usable with self-hosted GitLab instances.

**Incremental delivery**:
1. Phase 2 (Foundational) — unblocks everything, no visible user change yet
2. Phase 3 (US1) — delivers the core feature: configurable hostname in all URLs
3. Phase 4 (US2) — adds test coverage, verifies backward compatibility formally
4. Phase 5 (US3) — improves discoverability for new users
5. Phase 6 (Polish) — build + lint + end-to-end validation
