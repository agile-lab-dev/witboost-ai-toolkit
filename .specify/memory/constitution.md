<!--
  Sync Impact Report
  ==================
  Version change: 0.0.0 → 1.0.0 (initial ratification)
  Modified principles: N/A (initial version)
  Added sections:
    - Core Principles (6 principles)
    - Technology & Packaging Constraints
    - Development Workflow
    - Governance
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ compatible (Constitution Check
      section references constitution file generically)
    - .specify/templates/spec-template.md ✅ compatible (no constitution-
      specific references)
    - .specify/templates/tasks-template.md ✅ compatible (task phases are
      generic and adapt to any principle set)
    - .specify/templates/checklist-template.md ✅ compatible
  Follow-up TODOs: none
-->

# Witboost AI Toolkit Constitution

## Core Principles

### I. Portability First

The toolkit MUST live entirely in dot-folders (`.witboost/`,
`.github/`, `.vscode/`) that never collide with host project
source code, build artifacts, or configuration files.

- All toolkit files MUST reside under dot-prefixed directories
  at the repository root.
- The toolkit MUST be copy-paste deployable into any data
  product repository without requiring changes to the host
  project's build system, dependency tree, or directory layout.
- No toolkit file or generated artifact may write outside
  dot-folders unless the user explicitly configures an
  alternative output path.
- Removal of the toolkit MUST be achievable by deleting the
  dot-folders with no residual side effects on the host project.

**Rationale**: Data product repositories are owned by domain
teams with their own conventions. Isolation via dot-folders
guarantees zero friction on adoption and zero risk on removal.

### II. Multi-Harness Compatibility

The toolkit MUST support multiple AI coding agent integrations
— VS Code Copilot, Claude Code, GPT Codex, and any future
harness — from a single source of truth.

- Agent definitions, instruction files, and prompt templates
  MUST be generated per-harness from shared canonical
  configuration stored under `.witboost/`.
- Adding support for a new harness MUST NOT require modifying
  existing harness-specific outputs; it MUST only require a
  new generator target.
- Harness-specific files (e.g., `.github/copilot-instructions.md`,
  `.claude/`, `.codex/`) are generated artifacts and MUST NOT
  be hand-edited. The generator is the sole owner.

**Rationale**: Teams use different editors and AI tools.
A single source of truth eliminates drift between harness
configurations and reduces maintenance to one canonical file
set.

### III. Conversational UX

Agents MUST ask the user for input when context is insufficient
rather than guessing or fabricating values.

- When a required parameter, entity reference, or design
  decision cannot be resolved from available context, the agent
  MUST prompt the user with a clear question before proceeding.
- All interaction happens within the chat or conversation
  interface of the respective harness — agents MUST NOT
  require users to edit configuration files or run CLI commands
  as a prerequisite for a conversation-initiated workflow.
- Agents SHOULD present actionable choices (e.g., pick-lists,
  confirmed defaults) rather than open-ended questions when
  the option space is bounded.

**Rationale**: Guessing leads to incorrect scaffolding,
wrong API calls, and wasted cycles. Asking is always cheaper
than fixing silent mistakes.

### IV. API-First Design

The MCP server wrapping Witboost platform APIs MUST expose
atomic, composable tools. Agents orchestrate tools — tools
MUST NOT orchestrate agents.

- Each MCP tool MUST perform exactly one well-defined
  operation (e.g., create entity, validate descriptor, list
  output ports) and return structured results.
- Tools MUST NOT invoke other tools, trigger agent prompts,
  or embed business logic that belongs in agent workflows.
- Tool interfaces MUST be documented with JSON Schema
  describing inputs, outputs, and error codes.
- New platform capabilities MUST be exposed as new tools
  rather than overloading existing ones.

**Rationale**: Atomic tools are testable in isolation,
composable by any agent, and evolvable without cascading
breakage. Keeping orchestration in agents preserves
flexibility across harnesses with different planning
capabilities.

### V. Customizability

Users MUST be able to override agent behavior, add new
workflows, and configure API endpoints without modifying core
toolkit files.

- Configuration follows a layered model:
  **defaults** (shipped with toolkit) →
  **project** (`.witboost/config.yml`) →
  **user** (environment or user-level overrides).
- Each layer merges into the previous; later layers win on
  conflict.
- Users MUST be able to register custom agent commands, prompt
  extensions, and workflow hooks via project-level
  configuration files.
- Core toolkit files (under `.witboost/core/` or equivalent)
  MUST be treated as read-only by customization mechanisms.
  Upgrades replace core files without losing project or user
  overrides.

**Rationale**: Every organization has unique governance,
naming conventions, and platform extensions. A layered
configuration model lets teams adapt without forking, and
upgrade without merge conflicts.

### VI. Security by Default

Credentials and tokens MUST NEVER be stored in committed files.
Authentication uses environment variables or secure credential
stores exclusively.

- No toolkit file — generated or template — may contain
  literal secrets, API keys, or access tokens.
- All authentication configuration MUST reference environment
  variables (e.g., `WITBOOST_TOKEN`) or OS/IDE credential
  stores.
- `.gitignore` rules for sensitive paths (e.g., `.env`,
  `.witboost/local.yml`) MUST be included in the toolkit's
  default scaffolding.
- Agents MUST refuse to embed user-supplied secrets into
  files that would be committed to version control and MUST
  warn the user if such an action is requested.

**Rationale**: A single committed secret can compromise an
entire platform. Defense in depth starts with making the
insecure path impossible by default.

### VII. Brand Consistency — No "Backstage" References

All agent outputs, SSE messages, thinking traces, comments,
error messages, documentation, and user-facing text MUST use
the name **Witboost** — never "Backstage".

- The word "Backstage" MUST NOT appear in any agent
  instruction file, prompt template, skill description,
  SSE event payload, or code comment.
- The only permitted exception is the annotation key
  `backstage.io/source-location` and the YAML field
  `apiVersion: backstage.io/v1alpha1`, which are technical
  identifiers inherited from the upstream platform and
  required for API compatibility.
- When referring to the catalog, scaffolder, or any platform
  API, agents MUST say "Witboost catalog", "Witboost
  scaffolder", etc.
- If a third-party document or API response contains
  "Backstage", agents MUST NOT parrot it — they MUST
  rephrase using "Witboost".

**Rationale**: Witboost is the product brand. Leaking the
underlying technology name confuses users and weakens brand
identity. Consistent naming reinforces trust and
professionalism.

## Technology & Packaging Constraints

- **Runtime**: The MCP server MUST be implementable in
  TypeScript (Node.js ≥ 18) to align with the VS Code and
  Copilot extension ecosystem. Additional language bindings
  are permitted but MUST NOT be required.
- **Package format**: The toolkit MUST be distributable as a
  versioned tarball or npm package that can be unpacked into
  a repository's dot-folders without a global install step.
- **Dependency hygiene**: The toolkit MUST NOT add entries to
  the host project's `package.json`, `requirements.txt`, or
  equivalent dependency manifest.
- **Offline-capable**: Agent instruction files and prompt
  templates MUST function without network access. Only MCP
  tool calls that interact with the Witboost platform require
  connectivity.

## Development Workflow

- **Branching**: Feature work uses short-lived branches off
  `main`. Branch names follow `<type>/<short-description>`
  (e.g., `feat/mcp-entity-tools`).
- **Commits**: Conventional Commits format is required
  (`feat:`, `fix:`, `docs:`, `chore:`). Each commit MUST be
  atomic and self-contained.
- **Code review**: All changes to core toolkit files require
  at least one approving review before merge.
- **Testing**: MCP tools MUST have unit tests covering success
  and error paths. Agent instruction generators MUST have
  snapshot tests validating output per harness.
- **Releases**: Follow SemVer. Breaking changes to MCP tool
  interfaces or agent instruction schemas bump MAJOR.

## Governance

This constitution is the highest-authority document for the
Witboost AI Toolkit project. All design decisions, code
reviews, and architectural proposals MUST be evaluated against
these principles.

- **Precedence**: Constitution > project plan > spec >
  implementation convenience.
- **Amendment process**: Any principle change requires a pull
  request updating this file, with rationale documented in the
  PR description. Amendments that remove or redefine a
  principle bump the constitution MAJOR version. Additions
  bump MINOR. Clarifications bump PATCH.
- **Compliance review**: Every pull request MUST include a
  self-check confirming no principle is violated. Reviewers
  MUST verify compliance before approving.
- **Versioning**: This constitution follows Semantic Versioning.
  The version line below tracks the current state.

**Version**: 1.1.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-06-15
