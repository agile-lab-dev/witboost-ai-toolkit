import type { AgentDefinition, GeneratedFile, HarnessGenerator } from "./types.js";
import type { WitboostConfig } from "../config/schema.js";
import { resolveVariables } from "./shared.js";

export class DeepAgentsGenerator implements HarnessGenerator {
  harnessName = "deepagents";

  generate(agents: AgentDefinition[], config: WitboostConfig, outputDir: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // requirements.txt
    files.push({
      path: ".witboost/harness/deepagents/requirements.txt",
      content: "deepagents>=0.1.0\nlangchain-mcp-adapters>=0.1.0\n",
      overwrite: true,
    });

    // Individual agent modules
    const exports: string[] = [];
    for (const agent of agents) {
      const funcName = this.toFunctionName(agent.name);
      exports.push(funcName);

      files.push({
        path: `.witboost/harness/deepagents/${agent.name.replace(/-/g, "_")}.py`,
        content: this.buildAgentModule(agent, config),
        overwrite: true,
      });
    }

    // __init__.py
    const initLines = [
      '"""Witboost AI Toolkit — LangChain Deep Agents (auto-generated)."""',
      "",
    ];
    for (const agent of agents) {
      const modName = agent.name.replace(/-/g, "_");
      const funcName = this.toFunctionName(agent.name);
      initLines.push(`from .${modName} import ${funcName}`);
    }
    initLines.push("");
    initLines.push(`__all__ = [${exports.map((e) => `"${e}"`).join(", ")}]`);
    initLines.push("");

    files.push({
      path: ".witboost/harness/deepagents/__init__.py",
      content: initLines.join("\n"),
      overwrite: true,
    });

    return files;
  }

  private buildAgentModule(agent: AgentDefinition, config: WitboostConfig): string {
    const funcName = this.toFunctionName(agent.name);
    const agentDir = agent.name;
    const model =
      agent.harness?.deepagents?.model ?? "anthropic:claude-sonnet-4-20250514";
    const useSkills = agent.harness?.deepagents?.skills !== false;

    const lines = [
      `"""Witboost ${agent.displayName} agent (auto-generated from .witboost/agents/core/${agentDir}/)."""`,
      "import os",
      "from pathlib import Path",
      "",
      "from deepagents import create_deep_agent",
    ];

    if (useSkills) {
      lines.push("from deepagents.middleware.skills import SkillsMiddleware");
    }

    lines.push("from langchain_mcp_adapters.tools import load_mcp_tools");
    lines.push("");
    lines.push("_WITBOOST_DIR = Path(__file__).resolve().parent.parent");
    lines.push('_MCP_SERVER = str(_WITBOOST_DIR / "mcp-server" / "dist" / "index.cjs")');

    if (useSkills) {
      lines.push('_SKILLS_DIR = str(_WITBOOST_DIR / "skills")');
    }

    lines.push("");
    lines.push("");
    lines.push(`def ${funcName}(`);
    lines.push(`    model: str = "${model}",`);
    lines.push("    **kwargs,");
    lines.push("):");
    lines.push(`    """Create a Witboost ${agent.displayName} agent."""`);
    lines.push('    tools = load_mcp_tools(f"node {_MCP_SERVER}")');
    lines.push(
      `    instructions = (_WITBOOST_DIR / "agents" / "core" / "${agentDir}" / "instructions.md").read_text()`,
    );
    lines.push("");

    const middlewareItems: string[] = [];
    if (useSkills) {
      middlewareItems.push("SkillsMiddleware(sources=[_SKILLS_DIR])");
    }

    lines.push("    return create_deep_agent(");
    lines.push("        model=model,");
    lines.push("        tools=tools,");
    lines.push("        system_prompt=instructions,");
    if (middlewareItems.length > 0) {
      lines.push(`        middleware=[${middlewareItems.join(", ")}],`);
    } else {
      lines.push("        middleware=[],");
    }
    lines.push(`        name="witboost-${agent.name}",`);
    lines.push("        **kwargs,");
    lines.push("    )");
    lines.push("");

    return lines.join("\n");
  }

  /** Convert kebab-case agent name to snake_case function name with create_ prefix */
  private toFunctionName(name: string): string {
    return `create_${name.replace(/-/g, "_")}_agent`;
  }
}
