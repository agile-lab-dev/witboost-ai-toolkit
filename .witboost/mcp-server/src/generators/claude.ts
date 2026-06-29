import type { AgentDefinition, GeneratedFile, HarnessGenerator } from "./types.js";
import type { WitboostConfig } from "../config/schema.js";
import { resolveVariables } from "./shared.js";

export class ClaudeGenerator implements HarnessGenerator {
  harnessName = "claude";

  generate(agents: AgentDefinition[], config: WitboostConfig, outputDir: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Generate CLAUDE.md with all agents as sections
    const sections = agents.map((agent) => this.buildSection(agent, config));

    const claudeMd = [
      "# Witboost AI Toolkit",
      "",
      "This project uses the Witboost AI Toolkit for data product lifecycle management.",
      "",
      "## MCP Server",
      "",
      "The MCP server provides tools for interacting with the Witboost platform.",
      "It runs via stdio and is configured in `.claude/settings.json`.",
      "",
      ...sections,
    ].join("\n");

    files.push({
      path: "CLAUDE.md",
      content: claudeMd,
      overwrite: true,
    });

    // Generate .claude/settings.json
    files.push({
      path: ".claude/settings.json",
      content: JSON.stringify(
        {
          mcpServers: {
            "witboost-ai-toolkit": {
              command: "node",
              args: [".witboost/mcp-server/dist/index.cjs"],
            },
          },
        },
        null,
        2,
      ),
      overwrite: true,
    });

    return files;
  }

  private buildSection(agent: AgentDefinition, config: WitboostConfig): string {
    const subcommand = agent.harness?.claude?.subcommand ?? agent.name;
    const instructions = resolveVariables(agent, config);

    return [
      `## ${agent.displayName}`,
      "",
      `Use \`/${subcommand}\` to activate this workflow.`,
      "",
      instructions,
      "",
      "---",
      "",
    ].join("\n");
  }
}
