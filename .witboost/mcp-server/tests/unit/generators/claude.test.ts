import { describe, it, expect } from "vitest";
import { ClaudeGenerator } from "../../../src/generators/claude.js";
import type { AgentDefinition } from "../../../src/generators/types.js";
import type { WitboostConfig } from "../../../src/config/schema.js";

const config: WitboostConfig = {
  baseUrl: "https://test.witboost.com",
  token: "test-token",
  defaultDomain: "finance",
  defaultEnvironment: "development",
  apiVersion: "v1",
  requestTimeout: 30000,
};

const agent: AgentDefinition = {
  name: "test-agent",
  displayName: "Test Agent",
  description: "A test agent.",
  tools: ["list_blueprints", "create_data_product"],
  skills: ["witboost-catalog"],
  resolvedSkills: [
    {
      name: "witboost-catalog",
      description: "Navigate the Witboost catalog",
      tools: ["list_blueprints", "create_data_product"],
      content: "# Catalog",
    },
  ],
  category: "lifecycle",
  instructions: "# {{AGENT_NAME}}\n\n{{AGENT_TOOLS}}\n\n{{BASE_URL}}",
  harness: { claude: { subcommand: "test" } },
};

describe("ClaudeGenerator", () => {
  const gen = new ClaudeGenerator();

  it("has correct harness name", () => {
    expect(gen.harnessName).toBe("claude");
  });

  it("generates CLAUDE.md and .claude/settings.json", () => {
    const files = gen.generate([agent], config, "/repo");
    const paths = files.map((f) => f.path);

    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".claude/settings.json");
  });

  it("CLAUDE.md contains agent section with resolved variables", () => {
    const files = gen.generate([agent], config, "/repo");
    const claudeMd = files.find((f) => f.path === "CLAUDE.md")!;

    expect(claudeMd.content).toContain("## Test Agent");
    expect(claudeMd.content).toContain("/test");
    expect(claudeMd.content).toContain("`list_blueprints`");
    expect(claudeMd.content).toContain("https://test.witboost.com");
    expect(claudeMd.content).not.toContain("{{");
  });

  it("settings.json configures MCP server", () => {
    const files = gen.generate([agent], config, "/repo");
    const settings = files.find((f) => f.path === ".claude/settings.json")!;
    const parsed = JSON.parse(settings.content);

    expect(parsed.mcpServers["witboost-ai-toolkit"].command).toBe("node");
  });

  it("combines multiple agents into one CLAUDE.md", () => {
    const agent2: AgentDefinition = { ...agent, name: "agent-2", displayName: "Agent 2" };
    const files = gen.generate([agent, agent2], config, "/repo");

    const claudeMd = files.find((f) => f.path === "CLAUDE.md")!;
    expect(claudeMd.content).toContain("## Test Agent");
    expect(claudeMd.content).toContain("## Agent 2");
    // Still only one CLAUDE.md
    expect(files.filter((f) => f.path === "CLAUDE.md")).toHaveLength(1);
  });
});
