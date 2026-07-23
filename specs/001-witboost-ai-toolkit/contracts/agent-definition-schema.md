# Agent Definition Schema: Witboost AI Toolkit

**Phase**: 1 — Design & Contracts | **Date**: 2026-06-14

## File Structure

Each agent is defined by a pair of files in `.witboost/agents/core/<agent-name>/`:

```
.witboost/agents/core/<agent-name>/
├── agent.yml          # Structured metadata
└── instructions.md    # Prompt template (Markdown with variables)
```

Custom agents follow the same structure under `.witboost/agents/custom/`.

## agent.yml Schema

```yaml
# Agent metadata and configuration
name: "dp-creator"                    # Unique identifier (kebab-case)
displayName: "Data Product Creator"   # Human-readable name
description: >
  Guides the developer through creating a new data product
  by listing blueprints, collecting template parameters, and
  submitting the creation request via the Witboost API.

# MCP tools this agent depends on
tools:
  - list_blueprints
  - get_blueprint_schema
  - get_blueprint_parameters
  - create_data_product
  - list_repositories
  - clone_repository

# Agent categorization
category: "lifecycle"        # lifecycle | utility | custom

# Template variables resolved at setup time
variables:
  TOOLS_LIST: "auto"         # "auto" = generated from tools list above
  CONFIG: "auto"             # "auto" = generated from config.yml
  BASE_URL: "config"         # "config" = read from config at setup time

# Per-harness overrides (optional)
harness:
  copilot:
    command: "dp-creator"    # /dp-creator in Copilot chat
  claude:
    subcommand: "create"     # Part of the main CLAUDE.md workflow
  codex:
    section: "create"        # Section in AGENTS.md
  deepagents:
    model: "anthropic:claude-sonnet-4-20250514"  # Default model for this agent
    middleware: []            # Additional middleware classes
    skills: true              # Enable skills middleware with .witboost/skills/
```

## agent.yml Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Unique agent identifier. Must be kebab-case, match `^[a-z][a-z0-9-]*$` |
| `displayName` | `string` | ✅ | Human-readable name shown in agent listings |
| `description` | `string` | ✅ | One-paragraph description of the agent's purpose and workflow |
| `tools` | `string[]` | ✅ | List of MCP tool names the agent uses. Must match registered tool names |
| `category` | `string` | ❌ | Grouping: `lifecycle`, `utility`, `custom`. Default: `lifecycle` |
| `variables` | `Record<string, string>` | ❌ | Template variable resolution strategy. `"auto"` = computed, `"config"` = from config.yml, literal string = used as-is |
| `harness` | `object` | ❌ | Per-harness overrides. Keys are harness names, values are harness-specific settings |

## instructions.md Template

The companion Markdown file contains the agent's instruction prompt. It uses `{{VARIABLE_NAME}}` syntax for template variables resolved at setup time.

### Template Variables

| Variable | Resolution | Description |
|----------|-----------|-------------|
| `{{TOOLS_LIST}}` | Auto-generated | Formatted list of available MCP tools with names and descriptions |
| `{{AGENT_TOOLS}}` | Auto-generated | Subset of tools this specific agent uses |
| `{{CONFIG}}` | From config.yml | Relevant configuration values (base URL, defaults) |
| `{{BASE_URL}}` | From config.yml | Witboost platform base URL |
| `{{AGENT_NAME}}` | From agent.yml | The agent's display name |
| `{{AGENT_DESCRIPTION}}` | From agent.yml | The agent's description |

### Example instructions.md

```markdown
# {{AGENT_NAME}}

{{AGENT_DESCRIPTION}}

## Available Tools

{{AGENT_TOOLS}}

## Workflow

1. **List blueprints**: Call `list_blueprints` to show available templates.
   Present the results as a numbered list and ask the user to pick one.

2. **Get schema**: Call `get_blueprint_schema` with the selected blueprint ID.
   Identify required fields and their types.

3. **Collect parameters**: For each required field without a default value,
   ask the user to provide a value. Show the field description and type.
   Suggest defaults where applicable.

4. **Create data product**: Call `create_data_product` with the blueprint ID
   and collected parameters. Report the result to the user.

5. **Clone repository**: Ask the user if they want to clone the generated
   repository. If yes, call `clone_repository` with the repo URL.

## Error Handling

- If `list_blueprints` returns no results, inform the user that no blueprints
  are available and suggest checking their permissions or domain filter.
- If `create_data_product` fails with VALIDATION_ERROR, show the specific
  field errors and ask the user to correct them.
- If any tool returns UNAUTHORIZED, inform the user that their token may have
  expired and suggest refreshing it via the WITBOOST_TOKEN environment variable.
```

## Harness Output Formats

### VS Code Copilot

Each agent produces two files:

- `.github/agents/<name>.agent.md` — Agent definition with `@<name>` command
- `.github/prompts/<name>.prompt.md` — Reusable prompt (optional)

### Claude Code

All agents are compiled into a single `CLAUDE.md` at the repo root, with each agent as a section. The `.claude/` directory may contain additional config.

### OpenAI Codex

All agents are compiled into `AGENTS.md` at the repo root, with each agent as a section containing tool references and workflow steps.

### LangChain Deep Agents

Each agent produces a Python module in `.witboost/harness/deepagents/`:

- `<name>.py` — Pre-configured `create_deep_agent()` call with MCP tools and system prompt
- `__init__.py` — Exports all agent factory functions
- `requirements.txt` — Python dependencies (`deepagents`, `langchain-mcp-adapters`)

Generated module structure:

```python
"""Witboost Data Product Creator agent (auto-generated from .witboost/agents/core/dp-creator/)."""
import os
from pathlib import Path

from deepagents import create_deep_agent
from deepagents.middleware.skills import SkillsMiddleware
from langchain_mcp_adapters.tools import load_mcp_tools

_WITBOOST_DIR = Path(__file__).resolve().parent.parent
_MCP_SERVER = str(_WITBOOST_DIR / "mcp-server" / "dist" / "index.js")
_SKILLS_DIR = str(_WITBOOST_DIR / "skills")


def create_dp_creator_agent(
    model: str = "anthropic:claude-sonnet-4-20250514",
    **kwargs,
):
    """Create a Witboost Data Product Creator agent."""
    tools = load_mcp_tools(f"node {_MCP_SERVER}")
    instructions = (_WITBOOST_DIR / "agents" / "core" / "dp-creator" / "instructions.md").read_text()

    return create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=instructions,
        middleware=[SkillsMiddleware(sources=[_SKILLS_DIR])],
        name="witboost-dp-creator",
        **kwargs,
    )
```

This allows developers to use the agents programmatically:

```python
from witboost_agents import create_dp_creator_agent

agent = create_dp_creator_agent(model="openai:gpt-4.1")
result = agent.invoke({"messages": "Create a new data product for the Finance domain"})
```

## Validation Rules

- Every `agent.yml` must have a companion `instructions.md` in the same directory
- All tool names in `tools` must exist in the MCP server's tool registry
- `name` must be unique across core and custom agents
- `harness` overrides must reference valid harness names (matching registered generators)
- Template variables in `instructions.md` that are not defined in `variables` or auto-resolved produce a warning during setup
