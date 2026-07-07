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

  it("generates GEMINI.md and .gemini/settings.json", () => {
    const files = gen.generate([agent], config, "/repo");
    const paths = files.map((f) => f.path);

    expect(paths).toContain("GEMINI.md");
    expect(paths).toContain(".gemini/settings.json");
  });

  it("GEMINI.md contains agent section with resolved variables", () => {
    const files = gen.generate([agent], config, "/repo");
    const geminiMd = files.find((f) => f.path === "GEMINI.md")!;

    expect(geminiMd.content).toContain("## Test Agent");
    expect(geminiMd.content).toContain("`list_blueprints`");
    expect(geminiMd.content).toContain("https://test.witboost.com");
    expect(geminiMd.content).not.toContain("{{");
  });

  it("settings.json configures MCP server", () => {
    const files = gen.generate([agent], config, "/repo");
    const settings = files.find((f) => f.path === ".gemini/settings.json")!;
    const parsed = JSON.parse(settings.content);

    expect(parsed.mcpServers["witboost-ai-toolkit"].command).toBe("node");
    expect(parsed.mcpServers["witboost-ai-toolkit"].args).toContain(".witboost/mcp-server/dist/index.cjs");
  });

  it("combines multiple agents into one GEMINI.md", () => {
    const agent2: AgentDefinition = { ...agent, name: "agent-2", displayName: "Agent 2" };
    const files = gen.generate([agent, agent2], config, "/repo");

    const geminiMd = files.find((f) => f.path === "GEMINI.md")!;
    expect(geminiMd.content).toContain("## Test Agent");
    expect(geminiMd.content).toContain("## Agent 2");
    expect(files.filter((f) => f.path === "GEMINI.md")).toHaveLength(1);
  });
});
