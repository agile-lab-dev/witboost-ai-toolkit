import type { AgentDefinition, GeneratedFile, HarnessGenerator } from "./types.js";
import type { WitboostConfig } from "../config/schema.js";
import { resolveVariables } from "./shared.js";

export class GeminiGenerator implements HarnessGenerator {
  harnessName = "gemini";

  generate(agents: AgentDefinition[], config: WitboostConfig, outputDir: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Generate GEMINI.md with all agents as sections
    const sections = agents.map((agent) => this.buildSection(agent, config));

    const geminiMd = [
      "# Witboost AI Toolkit",
      "",
      "This project uses the Witboost AI Toolkit for data product lifecycle management.",
      "",
      "## MCP Server",
      "",
      "The MCP server provides tools for interacting with the Witboost platform.",
      "It is configured in `.gemini/settings.json`.",
      "",
      ...sections,
    ].join("\n");

    files.push({
      path: "GEMINI.md",
      content: geminiMd,
      overwrite: true,
    });

    // Generate .gemini/settings.json
    files.push({
      path: ".gemini/settings.json",
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
    const instructions = resolveVariables(agent, config);

    return [
      `## ${agent.displayName}`,
      "",
      instructions,
      "",
      "---",
      "",
    ].join("\n");
  }
}
