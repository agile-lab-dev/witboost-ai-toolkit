# Tasks: Witboost AI Toolkit

**Input**: Design documents from `/specs/001-witboost-ai-toolkit/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — spec and constitution mandate unit tests for MCP tools and snapshot tests for generator output.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project layout per plan.md:
- Source: `src/`
- Tests: `tests/`
- Agent definitions: `agents/`
- Skills: `skills/`
- Default config: `config/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling, and basic structure

- [ ] T001 Create project directory structure per plan.md — `src/server/`, `src/tools/`, `src/api/`, `src/config/`, `src/generators/`, `src/setup/`, `agents/core/`, `agents/custom/`, `skills/`, `config/`, `tests/unit/`, `tests/snapshots/`, `tests/fixtures/`
- [ ] T002 Initialize Node.js project with `package.json` — configure name, version, scripts (`build`, `test`, `test:watch`, `lint`, `format`), devDependencies (`@modelcontextprotocol/sdk`, `undici`, `yaml`, `tsup`, `vitest`, `@biomejs/biome`, `typescript`)
- [ ] T003 [P] Create `tsconfig.json` — strict mode, ESM output, Node.js 18+ target, path aliases for `src/`
- [ ] T004 [P] Create `tsup.config.ts` — two entry points: `src/server/index.ts` → `.witboost/mcp-server/dist/index.js`, `src/setup/index.ts` → `.witboost/mcp-server/setup.js`
- [ ] T005 [P] Create `biome.json` — TypeScript linting and formatting rules
- [ ] T006 [P] Create `.gitignore` — ignore `dist/`, `node_modules/`, `.env`, `*.local.yml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Define `ToolDefinition` and `ToolResult` types in `src/tools/types.ts` — per data-model.md (name, description, category, inputSchema, handler; content array, isError flag)
- [ ] T008 Define `WitboostConfig` type and validation in `src/config/schema.ts` — per data-model.md (baseUrl, token, defaultDomain, defaultEnvironment, apiVersion, requestTimeout) with URL and format validation
- [ ] T009 Implement layered config loader in `src/config/loader.ts` — resolution: built-in defaults → `.witboost/config.yml` → environment variables per config-schema.md
- [ ] T010 Define API types in `src/api/types.ts` — `ApiResponse<T>`, `ApiError` (code, message, status, retryAfter), Blueprint, DataProduct, Component, DeploymentStatus per data-model.md
- [ ] T011 Implement `WitboostApiClient` in `src/api/client.ts` — undici-based HTTP client with `get<T>`, `post<T>`, `put<T>`, `delete<T>` methods, bearer token auth, base URL normalization, timeout support, rate limit (429/Retry-After) handling
- [ ] T012 [P] Implement declarative tool registry in `src/tools/registry.ts` — register/lookup tools by name, category filtering, validate uniqueness, export full tool list for MCP registration
- [ ] T013 Implement MCP server setup in `src/server/server.ts` — create Server instance from `@modelcontextprotocol/sdk`, register all tools from registry, wire config into tool context
- [ ] T014 Implement stdio transport wrapper in `src/server/transport.ts` — wrap SDK's stdio transport for the MCP server
- [ ] T015 Implement server entry point in `src/server/index.ts` — load config, validate credentials (startup validation per FR-003), create server, start transport, handle startup errors with descriptive messages
- [ ] T016 [P] Define `AgentDefinition` type in `src/generators/types.ts` — per data-model.md (name, displayName, description, tools, category, instructions, variables, harness overrides) plus `HarnessGenerator` interface (generate, harnessName) and `GeneratedFile` type
- [ ] T017 [P] Create default config in `config/defaults.yml` — default values for `.witboost/config.yml` per config-schema.md
- [ ] T018 [P] Write unit tests for config loader in `tests/unit/config/loader.test.ts` — test layered resolution, env var overrides, missing required values, invalid URLs
- [ ] T019 [P] Write unit tests for API client in `tests/unit/api/client.test.ts` — test GET/POST/PUT/DELETE, auth header, error mapping, timeout, rate limiting (mocked HTTP)
- [ ] T020 [P] Write unit tests for tool registry in `tests/unit/tools/registry.test.ts` — test registration, lookup, uniqueness, category filtering

**Checkpoint**: Foundation ready — MCP server can start, validate credentials, and register tools. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — MCP Server Setup & Configuration (Priority: P1) 🎯 MVP

**Goal**: A developer can start the MCP server in a data product repo, validate credentials, and invoke all Witboost platform tools through AI agent chat.

**Independent Test**: Start the MCP server in stdio mode, send `tools/list` JSON-RPC request, verify all tool definitions are returned. Start with invalid token, confirm clear error.

### Implementation for User Story 1

- [ ] T021 [P] [US1] Implement blueprint tools in `src/tools/blueprints.ts` — `list_blueprints` (domain/type filter), `get_blueprint_schema` (by ID), `get_blueprint_parameters` (by ID) per mcp-tools.md contracts
- [ ] T022 [P] [US1] Implement data product tools in `src/tools/data-products.ts` — `list_data_products` (domain/status/pagination), `get_data_product`, `create_data_product` (blueprint + params), `update_data_product`, `delete_data_product` (with confirm) per mcp-tools.md contracts
- [ ] T023 [P] [US1] Implement component tools in `src/tools/components.ts` — `list_components` (by data product, type filter), `add_component` (blueprint + params), `remove_component` (with confirm) per mcp-tools.md contracts
- [ ] T024 [P] [US1] Implement repository tools in `src/tools/repositories.ts` — `list_repositories` (by data product), `clone_repository` (URL + target path) per mcp-tools.md contracts
- [ ] T025 [P] [US1] Implement provisioning tools in `src/tools/provisioning.ts` — `deploy` (with confirm), `undeploy` (with confirm), `get_deployment_status`, `get_deployment_logs` (tail, component filter) per mcp-tools.md contracts
- [ ] T026 [P] [US1] Implement testing tools in `src/tools/testing.ts` — `validate_descriptor` (API or local file), `run_tests`, `get_test_results` per mcp-tools.md contracts
- [ ] T027 [P] [US1] Implement governance tools in `src/tools/governance.ts` — `check_policies`, `get_approval_status` per mcp-tools.md contracts
- [ ] T028 [US1] Wire all tool modules into the registry in `src/tools/registry.ts` — import and register all tools from T021–T027
- [ ] T029 [P] [US1] Write unit tests for blueprint tools in `tests/unit/tools/blueprints.test.ts`
- [ ] T030 [P] [US1] Write unit tests for data product tools in `tests/unit/tools/data-products.test.ts`
- [ ] T031 [P] [US1] Write unit tests for component tools in `tests/unit/tools/components.test.ts`
- [ ] T032 [P] [US1] Write unit tests for repository tools in `tests/unit/tools/repositories.test.ts`
- [ ] T033 [P] [US1] Write unit tests for provisioning tools in `tests/unit/tools/provisioning.test.ts`
- [ ] T034 [P] [US1] Write unit tests for testing tools in `tests/unit/tools/testing.test.ts`
- [ ] T035 [P] [US1] Write unit tests for governance tools in `tests/unit/tools/governance.test.ts`
- [ ] T036 [P] [US1] Create test fixtures in `tests/fixtures/` — sample API responses for blueprints, data products, components, deployments, test results, policies

**Checkpoint**: MCP server fully functional with all ~20 tools. Can be started, validated, and invoked via stdio. User Story 1 independently testable.

---

## Phase 4: User Story 6 — Copy-Paste Deployment (Priority: P1) 🎯 MVP

**Goal**: The toolkit deploys into any data product repo by copying `.witboost/` with zero host project modifications. Removal = delete dot-folders.

**Independent Test**: Copy `.witboost/` into a sample repo with existing `package.json`, build scripts, and source code. Verify no existing files are modified. Run the host project's build commands — all succeed. Delete dot-folders — repo returns to original state.

### Implementation for User Story 6

- [ ] T037 [P] [US6] Create `.witboost/.gitignore` in `config/dot-gitignore` — template for ignoring `local.yml`, `.env`, `node_modules` inside `.witboost/`
- [ ] T038 [P] [US6] Create minimal `package.json` for `.witboost/mcp-server/` (shipped in dist) — name, version, main: `dist/index.js`, bin entry
- [ ] T039 [US6] Verify tsup build output produces self-contained `.witboost/` structure per plan.md — `mcp-server/dist/index.js`, `config.yml`, `.gitignore`, `agents/`, `skills/`
- [ ] T040 [US6] Build script in `package.json` copies config assets into `.witboost/` — `config/defaults.yml` → `config.yml`, `config/dot-gitignore` → `.gitignore`, `config/mcp-server-package.json` → `mcp-server/package.json`

**Checkpoint**: Built toolkit is a self-contained `.witboost/` folder that deploys via copy-paste into any repo.

---

## Phase 5: User Story 2 — Create a New Data Product via Agent (Priority: P1) 🎯 MVP

**Goal**: A developer invokes the DP Creator agent, picks a blueprint, fills in template fields conversationally, creates the data product, and clones the repo locally.

**Independent Test**: Invoke DP Creator agent in Copilot chat, select a blueprint from the list, provide field values when prompted, verify data product appears in Witboost catalog and repo is cloned locally.

### Implementation for User Story 2

- [ ] T041 [P] [US2] Create DP Creator agent definition in `agents/core/dp-creator/agent.yml` — per agent-definition-schema.md: name `dp-creator`, tools list (list_blueprints, get_blueprint_schema, get_blueprint_parameters, create_data_product, list_repositories, clone_repository), harness overrides for copilot/claude/codex/deepagents
- [ ] T042 [P] [US2] Write DP Creator instructions in `agents/core/dp-creator/instructions.md` — 5-step workflow (list blueprints → get schema → collect params → create DP → clone repo), template variables `{{TOOLS_LIST}}`, `{{AGENT_TOOLS}}`, `{{CONFIG}}`, error handling guidance per spec.md acceptance scenarios
- [ ] T043 [P] [US2] Create Business Logic agent definition in `agents/core/biz-logic/agent.yml` — tools for descriptor parsing, code generation context
- [ ] T044 [P] [US2] Write Business Logic instructions in `agents/core/biz-logic/instructions.md` — component selection, tech stack detection, code generation with conventions, ask-don't-guess behavior
- [ ] T045 [P] [US2] Create Test & Deploy agent definition in `agents/core/test-deploy/agent.yml` — tools for validation, testing, deployment, log retrieval
- [ ] T046 [P] [US2] Write Test & Deploy instructions in `agents/core/test-deploy/instructions.md` — validate → test → select environment → deploy → monitor workflow, destructive operation confirmation, log-based debugging guidance
- [ ] T047 [P] [US2] Create `.gitkeep` in `agents/custom/` — placeholder for user-defined agents

**Checkpoint**: All three core agent canonical definitions exist. Agent instructions contain full workflow steps, tool references, and error handling.

---

## Phase 6: User Story 3 — Implement Business Logic with Agent Assistance (Priority: P2)

**Goal**: The Business Logic Implementer agent reads the data product descriptor, identifies components and tech stacks, and generates code following project conventions with corresponding tests.

**Independent Test**: Open a repo with a known descriptor, invoke the agent, describe a business logic task, verify the agent generates syntactically correct code and test files in the appropriate component directory.

### Implementation for User Story 3

No new source code tasks — US3 depends on:
- MCP tools from US1 (already implemented)
- Agent definitions from US2 (biz-logic agent.yml + instructions.md already created in T043–T044)

The Business Logic Implementer agent is defined declaratively and compiled to harness-specific files in US5. Its functionality is validated by:

- [ ] T048 [US3] Validate `agents/core/biz-logic/instructions.md` covers all US3 acceptance scenarios — component selection, tech stack identification, convention-following code gen, ask-don't-guess for ambiguous requirements
- [ ] T049 [US3] Create sample descriptor fixture in `tests/fixtures/sample-descriptor.yaml` — a valid `catalog-info.yaml` with multiple components (storage, workload, output port) for testing agent workflows

**Checkpoint**: Business Logic Implementer agent is fully defined and can be compiled to any harness.

---

## Phase 7: User Story 4 — Validate, Test, and Deploy (Priority: P2)

**Goal**: The Test & Deploy agent validates descriptors, runs tests, deploys to selected environments, monitors status, retrieves logs, and helps debug failures interactively.

**Independent Test**: Invoke the agent on a repo with a known-good descriptor, verify validation passes, confirm environment selection prompt, check deployment status is reported.

### Implementation for User Story 4

No new source code tasks — US4 depends on:
- MCP tools from US1 (provisioning, testing, governance tools already implemented)
- Agent definitions from US2 (test-deploy agent.yml + instructions.md already created in T045–T046)

The Test & Deploy agent is defined declaratively. Its functionality is validated by:

- [ ] T050 [US4] Validate `agents/core/test-deploy/instructions.md` covers all US4 acceptance scenarios — validation reporting, failure explanation, environment selection, deployment monitoring, log analysis, undeploy confirmation
- [ ] T051 [P] [US4] Create deployment log fixtures in `tests/fixtures/deployment-logs.json` — sample success/failure deployment status responses and log entries for testing agent workflows

**Checkpoint**: Test & Deploy agent is fully defined and can be compiled to any harness.

---

## Phase 8: User Story 5 — Multi-Harness Agent Generation (Priority: P3)

**Goal**: The setup script generates harness-specific files for Copilot, Claude, Codex, and LangChain Deep Agents from canonical agent definitions. Generated files are functionally equivalent across harnesses.

**Independent Test**: Run the setup script with each harness target (`copilot`, `claude`, `codex`, `deepagents`) and verify generated files match expected format. Verify agent instructions contain all the same tool references and workflow steps.

### Skills Implementation

- [ ] T052 [P] [US5] Create Witboost Catalog skill in `skills/witboost-catalog/SKILL.md` — skill for navigating the Witboost catalog (entities, domains, components), compatible with Deep Agents `SkillsMiddleware` and Claude Code skill format
- [ ] T053 [P] [US5] Create Witboost Deploy skill in `skills/witboost-deploy/SKILL.md` — skill for deployment troubleshooting patterns (log analysis, common failure causes, environment management)

### Harness Generators

- [ ] T054 [P] [US5] Implement Copilot generator in `src/generators/copilot.ts` — implements `HarnessGenerator` interface, reads `AgentDefinition[]`, produces `.github/agents/<name>.agent.md` + `.github/instructions/<name>-lifecycle.instructions.md` + `.vscode/mcp.json` with resolved template variables
- [ ] T055 [P] [US5] Implement Claude generator in `src/generators/claude.ts` — implements `HarnessGenerator` interface, produces `CLAUDE.md` (all agents as sections) + `.claude/` config files with MCP server configuration
- [ ] T056 [P] [US5] Implement Codex generator in `src/generators/codex.ts` — implements `HarnessGenerator` interface, produces `AGENTS.md` (all agents as sections) with tool references and workflow steps
- [ ] T057 [P] [US5] Implement Deep Agents generator in `src/generators/deepagents.ts` — implements `HarnessGenerator` interface, produces `.witboost/harness/deepagents/` Python modules: `__init__.py` (exports factory functions), one `<name>.py` per agent with `create_deep_agent()` wiring (MCP tools via `langchain-mcp-adapters`, system prompt from `instructions.md`, `SkillsMiddleware` with `.witboost/skills/`), `requirements.txt` (`deepagents`, `langchain-mcp-adapters`). Per agent-definition-schema.md and plan.md Deep Agents architecture.

### Setup Script

- [ ] T058 [US5] Implement setup script in `src/setup/index.ts` — parse CLI args (`--harness`, `--dry-run`, `--force`, `--config`), load config, load canonical agent definitions from `agents/` (core + custom), resolve template variables, invoke selected generator(s), write output files, handle existing file conflicts, report generated files. Exit codes: 0 success, 1 config error, 2 generation error.
- [ ] T059 [US5] Add agent YAML+MD loader in `src/setup/index.ts` — parse `agent.yml` + read companion `instructions.md` for each agent directory under `agents/core/` and `agents/custom/`, produce `AgentDefinition[]`
- [ ] T060 [US5] Add template variable resolution in `src/setup/index.ts` — resolve `{{TOOLS_LIST}}`, `{{AGENT_TOOLS}}`, `{{CONFIG}}`, `{{BASE_URL}}`, `{{AGENT_NAME}}`, `{{AGENT_DESCRIPTION}}` in instruction templates per agent-definition-schema.md

### Generator Tests

- [ ] T061 [P] [US5] Write snapshot tests for Copilot generator in `tests/unit/generators/copilot.test.ts` — verify generated `.agent.md` and `.instructions.md` content matches expected format
- [ ] T062 [P] [US5] Write snapshot tests for Claude generator in `tests/unit/generators/claude.test.ts` — verify generated `CLAUDE.md` content matches expected format
- [ ] T063 [P] [US5] Write snapshot tests for Codex generator in `tests/unit/generators/codex.test.ts` — verify generated `AGENTS.md` content matches expected format
- [ ] T064 [P] [US5] Write snapshot tests for Deep Agents generator in `tests/unit/generators/deepagents.test.ts` — verify generated Python modules (`__init__.py`, `create_dp.py`, `implement.py`, `deploy.py`, `requirements.txt`) match expected format, validate `create_deep_agent()` call structure, MCP tool loading, skills middleware wiring
- [ ] T065 [P] [US5] Create generator test fixtures in `tests/fixtures/sample-agents/` — sample `agent.yml` + `instructions.md` for testing all generators
- [ ] T066 [P] [US5] Create expected snapshot files in `tests/snapshots/` — expected output per harness (copilot, claude, codex, deepagents)

**Checkpoint**: All four harness generators functional. Setup script generates correct output for each harness. Snapshot tests validate output format. Skills directory populated.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T067 [P] Verify `.witboost/.gitignore` covers all sensitive paths — `local.yml`, `.env`, `node_modules`, per FR-033
- [ ] T068 [P] Add `--dry-run` output formatting in setup script — human-readable summary of files that would be generated
- [ ] T069 Run full build (`npm run build`) and verify `.witboost/` structure matches plan.md output tree — `mcp-server/`, `agents/`, `skills/`, `config.yml`, `.gitignore`
- [ ] T070 Run quickstart.md validation — follow quickstart.md steps from scratch and verify each step works as documented
- [ ] T071 [P] Add README.md at repo root — project overview, development setup, build, test, contribution guidelines

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1: MCP Server (Phase 3)**: Depends on Phase 2 — implements all MCP tools
- **US6: Copy-Paste Deployment (Phase 4)**: Depends on Phase 2, benefits from Phase 3 for build validation
- **US2: DP Creator Agent (Phase 5)**: Depends on Phase 2 (needs types), can run parallel to Phase 3
- **US3: Business Logic Agent (Phase 6)**: Depends on Phase 5 (agent defs)
- **US4: Test & Deploy Agent (Phase 7)**: Depends on Phase 5 (agent defs)
- **US5: Multi-Harness Generation (Phase 8)**: Depends on Phase 2 (types), Phase 5 (agent defs)
- **Polish (Phase 9)**: Depends on all prior phases

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no story dependencies
- **US6 (P1)**: Can start after Phase 2 — no story dependencies (validates build output)
- **US2 (P1)**: Can start after Phase 2 — agent definitions are standalone YAML+MD files
- **US3 (P2)**: Depends on US2 (biz-logic agent defined there) — validation only
- **US4 (P2)**: Depends on US2 (test-deploy agent defined there) — validation only
- **US5 (P3)**: Depends on US2 (needs agent definitions as input to generators)

### Within Each User Story

- Types/models before services
- Services before tools
- Tools before registry wiring
- Implementation before tests
- Core implementation before integration

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
Parallel: T007, T008, T010, T016, T017 (independent type files)
Sequential: T009 (depends on T008), T011 (depends on T010), T012 (depends on T007)
Sequential: T013 → T014 → T015 (server depends on registry, transport)
Parallel: T018, T019, T020 (independent test files)
```

**Phase 3 (US1 — MCP Tools)**:
```
Parallel: T021, T022, T023, T024, T025, T026, T027 (independent tool modules)
Then: T028 (wires all into registry)
Parallel: T029, T030, T031, T032, T033, T034, T035, T036 (independent test files)
```

**Phase 5 (US2 — Agent Definitions)**:
```
Parallel: T041, T042, T043, T044, T045, T046, T047 (independent files)
```

**Phase 8 (US5 — Generators)**:
```
Parallel: T052, T053 (skills — independent files)
Parallel: T054, T055, T056, T057 (generators — independent modules)
Then: T058, T059, T060 (setup script — depends on generators)
Parallel: T061, T062, T063, T064, T065, T066 (tests — independent)
```

---

## Implementation Strategy

### MVP First (User Stories 1, 2, 6)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — MCP Server with all tools
4. Complete Phase 4: US6 — Copy-paste deployment validation
5. Complete Phase 5: US2 — Agent definitions (canonical YAML+MD)
6. **STOP and VALIDATE**: MCP server works, tools respond, agent definitions exist, toolkit deploys cleanly

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (MCP Server) → Test tools via stdio → **MVP Core!**
3. Add US6 (Copy-Paste) → Validate deployment isolation
4. Add US2 (Agent Defs) → Canonical agent definitions ready
5. Add US3 + US4 (Agent Validation) → All agents verified
6. Add US5 (Generators + Deep Agents) → Full multi-harness support with skills
7. Polish → Documentation, build validation, quickstart verification

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (MCP tools — 7 parallel tool modules)
   - Developer B: US2 (Agent definitions — 3 agents + custom placeholder)
   - Developer C: US6 (Build/deployment validation)
3. Once agents defined:
   - Developer A: US5 generators (Copilot + Claude)
   - Developer B: US5 generators (Codex + Deep Agents)
   - Developer C: Setup script + skills

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Deep Agents generator (T057) emits Python `.py` files as text — the generator itself is TypeScript
- Skills (T052–T053) use SKILL.md frontmatter+Markdown format compatible with both Deep Agents `SkillsMiddleware` and Claude Code
- All tools follow atomic, single-API-call design per Constitution Principle IV
- No credentials in config files — env vars only per Constitution Principle VI
