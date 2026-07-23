import { describe, it, expect } from "vitest";
import { CopilotGenerator } from "../../../src/generators/copilot.js";
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
  description: "A test agent for snapshot testing.",
  tools: ["list_blueprints", "create_data_product"],
  skills: ["witboost-catalog"],
  resolvedSkills: [
    {
      name: "witboost-catalog",
      description: "Navigate the Witboost catalog",
      tools: ["list_blueprints", "create_data_product"],
      content: "# Catalog skill content",
    },
  ],
  category: "lifecycle",
  instructions: `# {{AGENT_NAME}}

{{AGENT_DESCRIPTION}}

## Tools

{{AGENT_TOOLS}}

## Config

{{BASE_URL}}
`,
  harness: {
    copilot: { command: "test-agent" },
  },
};

describe("CopilotGenerator", () => {
  const gen = new CopilotGenerator();

  it("has correct harness name", () => {
    expect(gen.harnessName).toBe("copilot");
  });

  it("generates mcp.json, agent.md, and instructions.md", () => {
    const files = gen.generate([agent], config, "/repo");
    const paths = files.map((f) => f.path);

    expect(paths).toContain(".vscode/mcp.json");
    expect(paths).toContain(".github/agents/test-agent.agent.md");
    expect(paths).toContain(".github/instructions/test-agent-lifecycle.instructions.md");
  });

  it("mcp.json references the MCP server", () => {
    const files = gen.generate([agent], config, "/repo");
    const mcpJson = files.find((f) => f.path === ".vscode/mcp.json")!;
    const parsed = JSON.parse(mcpJson.content.replace(/^\s*\/\/.*$/gm, ""));

    expect(parsed.servers["witboost-ai-toolkit"].command).toBe("sh");
    expect(parsed.servers["witboost-ai-toolkit"].args).toContain(
      ".witboost/mcp-server/run.sh",
    );
  });

  it("agent.md has frontmatter with description and tools", () => {
    const files = gen.generate([agent], config, "/repo");
    const agentMd = files.find((f) => f.path === ".github/agents/test-agent.agent.md")!;

    expect(agentMd.content).toContain("description:");
    expect(agentMd.content).toContain("tools:");
    expect(agentMd.content).toContain("witboost-ai-toolkit");
  });

  it("resolves template variables in instructions", () => {
    const files = gen.generate([agent], config, "/repo");
    const instructions = files.find(
      (f) => f.path === ".github/instructions/test-agent-lifecycle.instructions.md",
    )!;

    expect(instructions.content).toContain("Test Agent");
    expect(instructions.content).toContain("A test agent for snapshot testing.");
    expect(instructions.content).toContain("list_blueprints, create_data_product");
    expect(instructions.content).toContain("`list_blueprints`");
    expect(instructions.content).toContain("`create_data_product`");
    expect(instructions.content).toContain("https://test.witboost.com");
    expect(instructions.content).not.toContain("{{");
  });

  it("generates files for multiple agents", () => {
    const agent2: AgentDefinition = {
      ...agent,
      name: "second-agent",
      displayName: "Second Agent",
    };
    const files = gen.generate([agent, agent2], config, "/repo");

    expect(files.filter((f) => f.path.includes("agent.md"))).toHaveLength(2);
    expect(files.filter((f) => f.path.includes("instructions.md"))).toHaveLength(2);
    // Only one mcp.json
    expect(files.filter((f) => f.path.includes("mcp.json"))).toHaveLength(1);
  });
});
