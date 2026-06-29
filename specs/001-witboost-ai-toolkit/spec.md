# Feature Specification: Witboost AI Toolkit

**Feature Directory**: `specs/001-witboost-ai-toolkit`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "Create a portable AI toolkit (.witboost/) that wraps Witboost platform APIs as an MCP server and provides AI coding agents for managing the full data product lifecycle directly from the developer's IDE/terminal."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — MCP Server Setup & Configuration (Priority: P1)

A developer clones a data product repository that contains the `.witboost/` toolkit. They set the `WITBOOST_BASE_URL` and `WITBOOST_TOKEN` environment variables, then open the project in their IDE. The MCP server starts automatically and validates the token. The developer can immediately invoke Witboost platform operations (list data products, check deployment status) through their AI agent's chat interface without any additional setup.

**Why this priority**: Without a working MCP server, no agent can interact with the Witboost platform. This is the foundational capability everything else depends on.

**Independent Test**: Can be tested by starting the MCP server in stdio mode, sending a `tools/list` JSON-RPC request, and verifying all tool definitions are returned. Token validation can be tested by starting with an invalid token and confirming a clear error message.

**Acceptance Scenarios**:

1. **Given** a repository with the `.witboost/` toolkit and valid environment variables, **When** the IDE opens and the MCP server starts, **Then** the server validates the token and responds to `tools/list` with all available tool categories (blueprints, data products, components, repositories, provisioning, testing, governance).
2. **Given** a repository with the `.witboost/` toolkit and a missing or invalid `WITBOOST_TOKEN`, **When** the MCP server attempts to start, **Then** it returns a clear error message indicating the authentication failure and does not expose any tools.
3. **Given** a running MCP server, **When** the developer invokes any tool (e.g., `list_data_products`), **Then** the server makes the corresponding Witboost REST API call and returns structured results.

---

### User Story 2 — Create a New Data Product via Agent (Priority: P1)

A developer wants to create a new data product. They open the chat in their IDE and invoke the Data Product Creator agent. The agent lists available blueprints from the Witboost catalog, the developer picks one, and the agent walks them through filling in the required template fields — asking for each missing value conversationally. Once all fields are provided, the agent creates the data product via the API and clones the generated repository locally.

**Why this priority**: Data product creation is the entry point of the entire lifecycle. Without it, subsequent agents (implement, deploy) have nothing to operate on.

**Independent Test**: Can be tested by invoking the Data Product Creator agent, selecting a blueprint from the presented list, providing template field values when prompted, and verifying the data product appears in the Witboost catalog and the repository is cloned locally.

**Acceptance Scenarios**:

1. **Given** the developer invokes the Data Product Creator agent, **When** the agent starts, **Then** it lists available blueprints as a numbered list and asks the developer to choose one.
2. **Given** a selected blueprint, **When** the agent retrieves the template schema, **Then** it identifies required fields and asks the developer for each missing value one at a time, providing defaults where applicable.
3. **Given** all required fields are filled, **When** the agent submits the creation request, **Then** the data product is created in Witboost and the agent confirms success with a link to the catalog entry.
4. **Given** a successful data product creation, **When** the agent offers to clone the repository, **Then** it clones the repo to the local workspace and opens it.

---

### User Story 3 — Implement Business Logic with Agent Assistance (Priority: P2)

A developer has a data product repository open. They invoke the Business Logic Implementer agent. The agent reads the data product descriptor (`catalog-info.yaml`), identifies the components and their tech stacks, and asks the developer what they want to implement. Based on the response, the agent writes code, creates tests, and updates configuration files — asking domain-specific questions when the developer's intent is ambiguous.

**Why this priority**: Implementation is the daily driver for developers. After creation, this is where most time is spent. However, developers can still implement manually without this agent.

**Independent Test**: Can be tested by opening a repository with a known descriptor, invoking the agent, describing a business logic task (e.g., "add a transformation that filters records by date"), and verifying the agent generates syntactically correct code files and corresponding test files in the appropriate component directory.

**Acceptance Scenarios**:

1. **Given** a data product repository with a valid descriptor, **When** the developer invokes the Business Logic Implementer, **Then** the agent parses the descriptor, lists the components, and asks which component the developer wants to work on.
2. **Given** a selected component, **When** the agent analyzes its structure, **Then** it identifies the tech stack (language, framework, build tool) and summarizes it to the developer before proceeding.
3. **Given** the developer describes a business logic task, **When** the agent generates code, **Then** the code follows the existing project conventions (naming, structure, patterns) and includes corresponding unit tests.
4. **Given** the agent encounters an ambiguous requirement, **When** multiple valid implementations exist, **Then** the agent presents the options and asks the developer to choose rather than guessing.

---

### User Story 4 — Validate, Test, and Deploy (Priority: P2)

A developer has finished implementing changes and wants to deploy. They invoke the Test & Deploy agent. The agent validates the descriptor against governance policies, runs tests, and reports results. If there are failures, it helps the developer understand and fix them interactively. Once all checks pass, the agent deploys to the selected environment, monitors provisioning status, and shows logs.

**Why this priority**: Deployment is the culmination of the lifecycle. While critical, developers can still deploy through the Witboost UI without this agent.

**Independent Test**: Can be tested by invoking the agent on a repository with a known-good descriptor, verifying the validation passes, confirming the agent asks which environment to deploy to, and checking the deployment status is reported back.

**Acceptance Scenarios**:

1. **Given** a data product repository, **When** the developer invokes the Test & Deploy agent, **Then** the agent validates the descriptor and reports policy compliance status.
2. **Given** validation failures, **When** the agent presents the errors, **Then** it explains each failure in plain language and suggests specific fixes.
3. **Given** all validations pass, **When** the agent asks which environment to deploy to, **Then** it presents available environments and confirms the selection before proceeding.
4. **Given** a deployment in progress, **When** the agent monitors provisioning, **Then** it shows real-time status updates and surfaces relevant log entries.
5. **Given** a failed deployment, **When** the developer asks for help debugging, **Then** the agent retrieves deployment logs and helps identify the root cause.
6. **Given** a deployed data product, **When** the developer requests an undeploy, **Then** the agent confirms the destructive operation before executing and reports the result.

---

### User Story 5 — Multi-Harness Agent Generation (Priority: P3)

A developer on a team that uses Claude Code (not VS Code Copilot) receives the `.witboost/` toolkit. They run the setup script, which generates Claude Code-specific configuration files (`.claude/`, `CLAUDE.md`) from the canonical agent definitions stored in `.witboost/agents/`. The agents work identically to the Copilot versions — same capabilities, same conversational flows, different harness format. The same approach applies to OpenAI Codex CLI and LangChain Deep Agents — each harness has a dedicated generator that produces the correct output format from the same canonical definitions.

**Why this priority**: Multi-harness support is a strategic differentiator but not required for initial usability. The toolkit functions fully with a single harness.

**Independent Test**: Can be tested by running the setup script with each harness target (copilot, claude, codex, deepagents) and verifying the generated files match the expected format for that harness, and that agent instructions contain all the same tool references and workflow steps.

**Acceptance Scenarios**:

1. **Given** the canonical agent definitions in `.witboost/agents/`, **When** the setup script targets VS Code Copilot, **Then** it generates `.github/agents/*.agent.md` and `.github/prompts/*.prompt.md` files with correct Copilot agent format.
2. **Given** the canonical agent definitions, **When** the setup script targets Claude Code, **Then** it generates `CLAUDE.md` and `.claude/` files with correct Claude Code conventions.
3. **Given** the canonical agent definitions, **When** the setup script targets LangChain Deep Agents, **Then** it generates `.witboost/harness/deepagents/` Python modules with pre-configured `create_deep_agent()` calls that load the MCP tools and use the canonical instructions as system prompts.
4. **Given** a change to a canonical agent definition, **When** the setup script is re-run for any harness, **Then** the generated files reflect the change without manual editing.
5. **Given** custom agent definitions in `.witboost/agents/custom/`, **When** the setup script runs, **Then** it includes custom agents alongside core agents in the generated output.

---

### User Story 6 — Copy-Paste Deployment into Existing Repository (Priority: P1)

A developer copies the `.witboost/` folder (and runs the setup script) into an existing data product repository that already has its own source code, build system, and configuration. The toolkit does not interfere with any existing files — no modifications to `package.json`, no new build steps, no naming collisions. Removing the toolkit is as simple as deleting the dot-folders.

**Why this priority**: Frictionless adoption is critical. If the toolkit conflicts with existing repositories, teams will not adopt it.

**Independent Test**: Can be tested by copying the toolkit into a repository with a complex existing structure (multiple languages, build files, CI configs), running the setup script, and verifying no existing files are modified. Then deleting the dot-folders and verifying the repository returns to its original state.

**Acceptance Scenarios**:

1. **Given** an existing data product repository with its own `package.json`, build scripts, and source code, **When** the `.witboost/` toolkit is copied in, **Then** no existing files are modified, no new dependencies appear in the host project's dependency manifests.
2. **Given** the toolkit is installed, **When** the developer runs their existing build and test commands, **Then** all commands succeed identically to before the toolkit was added.
3. **Given** the developer wants to remove the toolkit, **When** they delete `.witboost/`, `.github/agents/`, `.github/prompts/`, `.claude/`, `CLAUDE.md`, and `.vscode/mcp.json`, **Then** the repository returns to its exact pre-toolkit state with no residual files or configuration.

---

### Edge Cases

- What happens when the Witboost API is unreachable? The MCP server must return clear error messages indicating connectivity failure, and agents must inform the user that platform operations are unavailable while still allowing local-only operations (e.g., reading descriptors, generating code).
- What happens when the user's token expires mid-session? The MCP server must detect authentication failures on API calls and prompt the user to refresh their token, rather than failing silently or returning cryptic errors.
- What happens when two developers run the toolkit simultaneously on the same data product? Each developer's MCP server operates independently via stdio transport — no shared state, no conflicts.
- What happens when the host repository already has `.github/` files (e.g., CI workflows)? The toolkit only writes to `.github/agents/` and `.github/prompts/` subdirectories, which are unlikely to conflict. The setup script must check for existing files before overwriting and warn the user.
- What happens when the target project doesn't have Python installed but Deep Agents harness is requested? The setup script must detect the absence of Python and skip the Deep Agents generator with a clear message, without failing the overall setup.
- What happens when a blueprint schema contains nested or conditional fields? The Data Product Creator agent must handle complex schemas by walking the structure depth-first, asking about nested fields in logical groups.
- What happens when a deployment fails due to infrastructure issues outside the developer's control? The Test & Deploy agent should clearly distinguish between errors the developer can fix (descriptor issues, code bugs) and infrastructure issues that require platform team involvement.

## Requirements *(mandatory)*

### Functional Requirements

#### MCP Server

- **FR-001**: The MCP server MUST expose atomic tools for each Witboost platform API category: blueprints (list, get schema, get parameters), data products (create, get, list, update, delete), components (add, remove, list), repositories (clone, list), provisioning (deploy, undeploy, get status, get logs), testing (validate descriptor, run tests, get results), and governance (check policies, get approval status).
- **FR-002**: The MCP server MUST use stdio transport for communication with AI agent harnesses.
- **FR-003**: The MCP server MUST validate the presence and format of `WITBOOST_BASE_URL` and `WITBOOST_TOKEN` environment variables on startup, returning a descriptive error if either is missing or invalid.
- **FR-004**: Each MCP tool MUST accept structured input parameters and return structured JSON results, including error codes and messages for failure cases.
- **FR-005**: The MCP server MUST NOT invoke other tools or embed orchestration logic — each tool performs exactly one API operation.
- **FR-006**: Tool interfaces MUST be documented with JSON Schema describing inputs, outputs, and error codes.

#### Data Product Creator Agent

- **FR-007**: The Data Product Creator agent MUST list available blueprints from the Witboost catalog and present them as a numbered list for the user to choose.
- **FR-008**: The agent MUST retrieve the JSON schema for the selected blueprint's template and identify required vs. optional fields.
- **FR-009**: The agent MUST ask the user for each required field value that cannot be inferred from context, providing defaults where reasonable.
- **FR-010**: The agent MUST create the data product via the Witboost API using the collected field values.
- **FR-011**: The agent MUST offer to clone the generated repository to the local workspace after successful creation.

#### Business Logic Implementer Agent

- **FR-012**: The Business Logic Implementer agent MUST parse the data product descriptor (`catalog-info.yaml`) to identify components, their types, and tech stacks.
- **FR-013**: The agent MUST ask the user which component to work on when multiple components exist.
- **FR-014**: The agent MUST generate code that follows the existing project conventions (file naming, directory structure, code style patterns).
- **FR-015**: The agent MUST generate corresponding unit tests for any business logic code it creates.
- **FR-016**: The agent MUST ask the user for clarification when a task description is ambiguous rather than guessing.

#### Test & Deploy Agent

- **FR-017**: The Test & Deploy agent MUST validate the data product descriptor against governance policies before deployment.
- **FR-018**: The agent MUST run available tests and report results, explaining failures in plain language.
- **FR-019**: The agent MUST ask the user which environment to deploy to and confirm destructive operations (deploy, undeploy) before executing.
- **FR-020**: The agent MUST retrieve and display provisioning status and deployment logs during and after deployment.
- **FR-021**: The agent MUST help the developer debug deployment failures by analyzing logs and suggesting fixes.

#### Multi-Harness Support

- **FR-022**: The toolkit MUST store canonical agent definitions in `.witboost/agents/` as the single source of truth.
- **FR-023**: A setup/sync script MUST generate harness-specific files for VS Code Copilot (`.github/agents/*.agent.md`, `.github/prompts/*.prompt.md`), Claude Code (`CLAUDE.md`, `.claude/`), OpenAI Codex CLI (`codex.md` or `AGENTS.md`), and LangChain Deep Agents (`.witboost/harness/deepagents/` Python modules with `create_deep_agent()` wiring).
- **FR-024**: Generated harness-specific files MUST be functionally equivalent — same tools, same workflows, same conversational patterns.
- **FR-025**: Adding support for a new harness MUST NOT require modifying existing harness generators or canonical definitions.
- **FR-025a**: The Deep Agents generator MUST produce Python modules that use `langchain-mcp-adapters` to connect the MCP server's stdio tools, pass the canonical `instructions.md` as the system prompt, and expose agents importable as `from witboost_agents import create_dp_agent, implement_agent, deploy_agent`.

#### Portability & Isolation

- **FR-026**: All toolkit files MUST reside under dot-prefixed directories (`.witboost/`, `.github/agents/`, `.github/prompts/`, `.claude/`, `.vscode/`) at the repository root.
- **FR-027**: The toolkit MUST NOT modify, create, or depend on any files in the host project's source tree, build system, or dependency manifests (`package.json`, `requirements.txt`, etc.).
- **FR-028**: Removal of the toolkit MUST be achievable by deleting the dot-folders with no residual side effects on the host project.

#### Configuration & Customization

- **FR-029**: The toolkit MUST support a layered configuration model: defaults (shipped) → project-level (`.witboost/config.yml`) → user-level (environment variables).
- **FR-030**: Users MUST be able to add custom agent definitions in `.witboost/agents/custom/` that are included in generated output alongside core agents.
- **FR-031**: `.witboost/config.yml` MUST support configuring at minimum: API base URL, default domain, and default environment.

#### Security

- **FR-032**: Credentials MUST be sourced exclusively from environment variables (`WITBOOST_BASE_URL`, `WITBOOST_TOKEN`) — no credentials in committed files.
- **FR-033**: The toolkit MUST include `.gitignore` rules for any generated credential files or local configuration (e.g., `.witboost/local.yml`, `.env`).
- **FR-034**: Agents MUST refuse to embed user-supplied secrets into files that would be committed to version control and MUST warn the user if such an action is requested.

### Key Entities

- **Blueprint**: A template in the Witboost catalog that defines the structure and schema for creating a data product or component. Key attributes: name, description, JSON schema, template parameters.
- **Data Product**: A logical container managed by the Witboost platform that groups related components (storage, processing, output ports). Key attributes: identifier, name, domain, version, descriptor, components list, deployment status.
- **Component**: A building block within a data product (e.g., storage area, output port, workload). Key attributes: type, name, tech stack, descriptor section, provisioning state.
- **MCP Tool**: An atomic operation exposed by the MCP server that maps to a single Witboost REST API call. Key attributes: name, input schema, output schema, API endpoint, error codes.
- **Agent**: An AI coding agent that orchestrates MCP tools to guide the user through a lifecycle workflow. Key attributes: name, harness command, tool dependencies, conversation flow, harness-specific output format.
- **Harness**: An AI coding environment that hosts agents (VS Code Copilot, Claude Code, OpenAI Codex, LangChain Deep Agents). Key attributes: name, file format conventions, agent registration mechanism.
- **Deep Agent**: A LangChain Deep Agents harness agent created via `create_deep_agent()`. Uses middleware (filesystem, memory, skills, subagents), supports MCP tools via `langchain-mcp-adapters`, and runs standalone (CLI/server) or embedded in applications.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from an empty workspace to a fully created and locally cloned data product in under 10 minutes using only the chat interface — no Witboost UI interaction required.
- **SC-002**: The toolkit can be added to any existing data product repository by copying the `.witboost/` folder and running the setup script in under 2 minutes, with zero modifications to existing project files.
- **SC-003**: All three agent workflows (create, implement, deploy) function identically across at least two AI harnesses (VS Code Copilot and one other).
- **SC-004**: Removing the toolkit from a repository (deleting dot-folders) leaves zero residual files or configuration changes.
- **SC-005**: The MCP server starts and validates credentials in under 5 seconds, and individual tool calls complete in under 3 seconds (excluding network latency to the Witboost API).
- **SC-006**: 90% of developers can complete their first data product creation using the agent without consulting external documentation.
- **SC-007**: The Test & Deploy agent surfaces deployment failures with actionable diagnostic information in 100% of cases where the Witboost API provides error details.
- **SC-008**: Custom agent definitions added by users are preserved across toolkit version upgrades with no manual migration steps.

## Assumptions

- The Witboost platform exposes a REST API that supports all operations needed by the MCP tools (blueprints, CRUD on data products/components, provisioning, testing, governance). The API is documented and stable.
- Developers have Node.js 18 or later installed in their development environment (required to run the TypeScript MCP server).
- Data product repositories use `catalog-info.yaml` (or equivalent descriptor file) as the standard descriptor format following Witboost conventions.
- The Witboost platform uses token-based authentication that can be represented as a single bearer token string.
- The initial release targets VS Code Copilot as the primary harness, with Claude Code as the secondary harness. OpenAI Codex CLI and LangChain Deep Agents support may follow in a subsequent iteration.
- For the Deep Agents harness, developers must have Python 3.11+ and the `deepagents` package installed. The generated modules use `langchain-mcp-adapters` to bridge the Node.js MCP server with the Python agent runtime.
- The setup/sync script can be implemented as a cross-platform shell script or Node.js script that runs without additional dependencies beyond Node.js.
- Developers work on one data product per repository (the standard Witboost data product repository structure).
- The `.github/agents/` and `.github/prompts/` directories are not already in use by the host project for other purposes. If they are, the setup script will warn the user and require confirmation before writing.
