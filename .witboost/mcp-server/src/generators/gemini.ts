import type { AgentDefinition, GeneratedFile, HarnessGenerator } from "./types.js";
import type { WitboostConfig } from "../config/schema.js";
import { resolveVariables } from "./shared.js";

export class GeminiGenerator implements HarnessGenerator {
  harnessName = "gemini";

  generate(agents: AgentDefinition[], config: WitboostConfig, outputDir: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Generate per-agent instruction files under .gemini/instructions/
    const importLines: string[] = [];
    for (const agent of agents) {
      const instructions = resolveVariables(agent, config);
      const fileName = `${agent.name}.md`;

      files.push({
        path: `.gemini/instructions/${fileName}`,
        content: `# ${agent.displayName}\n\n${instructions}\n`,
        overwrite: true,
      });

      importLines.push(`@.gemini/instructions/${fileName}`);
    }

    // Generate per-skill files under .gemini/skills/
    const emittedSkills = new Set<string>();
    for (const agent of agents) {
      for (const skill of agent.resolvedSkills) {
        if (emittedSkills.has(skill.name)) continue;
        emittedSkills.add(skill.name);

        const skillFileName = `${skill.name}.md`;
        const toolsList = skill.tools.map((t) => `- \`${t}\``).join("\n");
        const skillContent = [
          `# ${skill.name}`,
          "",
          skill.description,
          "",
          "## Tools",
          "",
          toolsList,
          "",
          skill.content,
          "",
        ].join("\n");

        files.push({
          path: `.gemini/skills/${skillFileName}`,
          content: skillContent,
          overwrite: true,
        });

        importLines.push(`@.gemini/skills/${skillFileName}`);
      }
    }

    // Generate root GEMINI.md with @imports
    const geminiMd = [
      "# Witboost AI Toolkit",
      "",
      "This project uses the Witboost AI Toolkit for data product lifecycle management.",
      "The MCP server is configured in `.gemini/settings.json`.",
      "",
      ...importLines,
      "",
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
}
