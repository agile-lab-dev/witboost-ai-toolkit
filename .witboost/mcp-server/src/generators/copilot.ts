import type { AgentDefinition, GeneratedFile, HarnessGenerator } from "./types.js";
import type { WitboostConfig } from "../config/schema.js";
import { buildSkillsSection, resolveVariables } from "./shared.js";

export class CopilotGenerator implements HarnessGenerator {
  harnessName = "copilot";

  generate(agents: AgentDefinition[], config: WitboostConfig, outputDir: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Generate .vscode/mcp.json
    files.push({
      path: ".vscode/mcp.json",
      content: JSON.stringify(
        {
          servers: {
            "witboost-ai-toolkit": {
              type: "stdio",
              command: "node",
              args: [".witboost/mcp-server/dist/index.cjs"],
              env: {},
            },
          },
        },
        null,
        2,
      ),
      overwrite: true,
    });

    // Generate agent files
    for (const agent of agents) {
      const instructions = resolveVariables(agent, config);

      // .github/agents/<name>.agent.md
      files.push({
        path: `.github/agents/${agent.name}.agent.md`,
        content: this.buildAgentMd(agent, instructions),
        overwrite: true,
      });

      // .github/prompts/<name>.prompt.md
      files.push({
        path: `.github/prompts/${agent.name}.prompt.md`,
        content: instructions,
        overwrite: true,
      });
    }

    return files;
  }

  private buildAgentMd(agent: AgentDefinition, instructions: string): string {
    const lines = [
      "---",
      `description: "${agent.description.replace(/\n/g, " ").trim()}"`,
      "tools:",
      '  - "witboost-ai-toolkit"',
      "---",
      "",
      instructions,
    ];
    return lines.join("\n");
  }
}
