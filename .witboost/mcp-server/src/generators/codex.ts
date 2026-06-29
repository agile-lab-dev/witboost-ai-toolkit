import type { AgentDefinition, GeneratedFile, HarnessGenerator } from "./types.js";
import type { WitboostConfig } from "../config/schema.js";
import { resolveVariables } from "./shared.js";

export class CodexGenerator implements HarnessGenerator {
  harnessName = "codex";

  generate(agents: AgentDefinition[], config: WitboostConfig, outputDir: string): GeneratedFile[] {
    const sections = agents.map((agent) => this.buildSection(agent, config));

    const agentsMd = [
      "# Witboost AI Toolkit — Agent Definitions",
      "",
      "This file defines the AI coding agents for the Witboost data product lifecycle.",
      "Each agent has access to MCP tools via the Witboost MCP server.",
      "",
      "## MCP Server",
      "",
      "Start the MCP server before using any agent:",
      "```",
      "node .witboost/mcp-server/dist/index.js",
      "```",
      "",
      ...sections,
    ].join("\n");

    return [
      {
        path: "AGENTS.md",
        content: agentsMd,
        overwrite: true,
      },
    ];
  }

  private buildSection(agent: AgentDefinition, config: WitboostConfig): string {
    const section = agent.harness?.codex?.section ?? agent.name;
    const instructions = resolveVariables(agent, config);

    return [
      `## ${agent.displayName} (\`${section}\`)`,
      "",
      instructions,
      "",
      "---",
      "",
    ].join("\n");
  }
}
