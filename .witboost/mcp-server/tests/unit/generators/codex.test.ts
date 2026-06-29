import { describe, it, expect } from "vitest";
import { CodexGenerator } from "../../../src/generators/codex.js";
import type { AgentDefinition } from "../../../src/generators/types.js";
import type { WitboostConfig } from "../../../src/config/schema.js";

const config: WitboostConfig = {
  baseUrl: "https://test.witboost.com",
  token: "test-token",
  defaultDomain: "",
  defaultEnvironment: "",
  apiVersion: "v1",
  requestTimeout: 30000,
};

const agent: AgentDefinition = {
  name: "test-agent",
  displayName: "Test Agent",
  description: "A test agent.",
  tools: ["list_blueprints"],
  skills: ["witboost-catalog"],
  resolvedSkills: [
    {
      name: "witboost-catalog",
      description: "Navigate the Witboost catalog",
      tools: ["list_blueprints"],
      content: "# Catalog",
    },
  ],
  category: "lifecycle",
  instructions: "# {{AGENT_NAME}}\n\n{{AGENT_TOOLS}}",
  harness: { codex: { section: "test" } },
};

describe("CodexGenerator", () => {
  const gen = new CodexGenerator();

  it("has correct harness name", () => {
    expect(gen.harnessName).toBe("codex");
  });

  it("generates a single AGENTS.md", () => {
    const files = gen.generate([agent], config, "/repo");
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("AGENTS.md");
  });

  it("AGENTS.md contains agent section with resolved vars", () => {
    const files = gen.generate([agent], config, "/repo");
    const content = files[0].content;

    expect(content).toContain("## Test Agent (`test`)");
    expect(content).toContain("`list_blueprints`");
    expect(content).not.toContain("{{");
  });

  it("combines multiple agents into sections", () => {
    const agent2: AgentDefinition = { ...agent, name: "agent-2", displayName: "Agent 2" };
    const files = gen.generate([agent, agent2], config, "/repo");

    expect(files).toHaveLength(1);
    expect(files[0].content).toContain("## Test Agent");
    expect(files[0].content).toContain("## Agent 2");
  });
});
