import type { AgentDefinition } from "./types.js";
import type { WitboostConfig } from "../config/schema.js";

/** Build a Markdown section listing skills and their tools */
export function buildSkillsSection(agent: AgentDefinition): string {
  if (agent.resolvedSkills.length === 0) {
    // Fallback: flat tool list (backward compat for agents without skills)
    if (agent.tools.length === 0) return "";
    return ["## Available Tools", "", ...agent.tools.map((t) => `- \`${t}\``), ""].join("\n");
  }

  const lines = ["## Skills", ""];
  for (const skill of agent.resolvedSkills) {
    lines.push(`### ${skill.name}`);
    lines.push("");
    lines.push(skill.description);
    lines.push("");
    lines.push("**Tools:**");
    for (const tool of skill.tools) {
      lines.push(`- \`${tool}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Resolve template variables in agent instructions */
export function resolveVariables(agent: AgentDefinition, config: WitboostConfig): string {
  let content = agent.instructions;

  const toolsList = agent.tools.map((t) => `- \`${t}\``).join("\n");
  const skillsSection = buildSkillsSection(agent);

  content = content.replace(/\{\{AGENT_NAME\}\}/g, agent.displayName);
  content = content.replace(/\{\{AGENT_DESCRIPTION\}\}/g, agent.description.trim());
  content = content.replace(/\{\{AGENT_TOOLS\}\}/g, toolsList);
  content = content.replace(/\{\{TOOLS_LIST\}\}/g, toolsList);
  content = content.replace(/\{\{SKILLS_SECTION\}\}/g, skillsSection);
  content = content.replace(/\{\{BASE_URL\}\}/g, config.baseUrl);
  content = content.replace(
    /\{\{CONFIG\}\}/g,
    `Base URL: ${config.baseUrl}\nDefault Domain: ${config.defaultDomain || "(not set)"}\nDefault Environment: ${config.defaultEnvironment || "(not set)"}`,
  );

  return content;
}
