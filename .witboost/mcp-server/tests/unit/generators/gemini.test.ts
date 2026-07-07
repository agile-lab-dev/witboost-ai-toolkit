import { describe, it, expect } from "vitest";
import { GeminiGenerator } from "../../../src/generators/gemini.js";
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
};

describe("GeminiGenerator", () => {
  const gen = new GeminiGenerator();

  it("has correct harness name", () => {
    expect(gen.harnessName).toBe("gemini");
  });

  it("generates GEMINI.md, settings.json, instructions, and skills", () => {
    const files = gen.generate([agent], config, "/repo");
    const paths = files.map((f) => f.path);

    expect(paths).toContain("GEMINI.md");
    expect(paths).toContain(".gemini/settings.json");
    expect(paths).toContain(".gemini/instructions/test-agent.md");
    expect(paths).toContain(".gemini/skills/witboost-catalog.md");
  });

  it("GEMINI.md uses @imports for instructions and skills", () => {
    const files = gen.generate([agent], config, "/repo");
    const geminiMd = files.find((f) => f.path === "GEMINI.md")!;

    expect(geminiMd.content).toContain("@.gemini/instructions/test-agent.md");
    expect(geminiMd.content).toContain("@.gemini/skills/witboost-catalog.md");
  });

  it("instruction file contains resolved variables", () => {
    const files = gen.generate([agent], config, "/repo");
    const instrFile = files.find((f) => f.path === ".gemini/instructions/test-agent.md")!;

    expect(instrFile.content).toContain("# Test Agent");
    expect(instrFile.content).toContain("`list_blueprints`");
    expect(instrFile.content).toContain("https://test.witboost.com");
    expect(instrFile.content).not.toContain("{{");
  });

  it("skill file contains description, tools, and content", () => {
    const files = gen.generate([agent], config, "/repo");
    const skillFile = files.find((f) => f.path === ".gemini/skills/witboost-catalog.md")!;

    expect(skillFile.content).toContain("# witboost-catalog");
    expect(skillFile.content).toContain("Navigate the Witboost catalog");
    expect(skillFile.content).toContain("`list_blueprints`");
    expect(skillFile.content).toContain("# Catalog");
  });

  it("settings.json configures MCP server", () => {
    const files = gen.generate([agent], config, "/repo");
    const settings = files.find((f) => f.path === ".gemini/settings.json")!;
    const parsed = JSON.parse(settings.content);

    expect(parsed.mcpServers["witboost-ai-toolkit"].command).toBe("node");
    expect(parsed.mcpServers["witboost-ai-toolkit"].args).toContain(".witboost/mcp-server/dist/index.cjs");
  });

  it("combines multiple agents, deduplicates shared skills", () => {
    const agent2: AgentDefinition = {
      ...agent,
      name: "agent-2",
      displayName: "Agent 2",
      // shares the same skill
    };
    const files = gen.generate([agent, agent2], config, "/repo");
    const paths = files.map((f) => f.path);

    expect(paths).toContain(".gemini/instructions/test-agent.md");
    expect(paths).toContain(".gemini/instructions/agent-2.md");
    // Shared skill emitted only once
    expect(paths.filter((p) => p === ".gemini/skills/witboost-catalog.md")).toHaveLength(1);

    const geminiMd = files.find((f) => f.path === "GEMINI.md")!;
    expect(geminiMd.content).toContain("@.gemini/instructions/test-agent.md");
    expect(geminiMd.content).toContain("@.gemini/instructions/agent-2.md");
  });
});
