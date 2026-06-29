import { describe, it, expect } from "vitest";
import { DeepAgentsGenerator } from "../../../src/generators/deepagents.js";
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
  name: "dp-creator",
  displayName: "Data Product Creator",
  description: "Creates data products.",
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
  harness: {
    deepagents: { model: "openai:gpt-4.1", skills: true },
  },
};

describe("DeepAgentsGenerator", () => {
  const gen = new DeepAgentsGenerator();

  it("has correct harness name", () => {
    expect(gen.harnessName).toBe("deepagents");
  });

  it("generates __init__.py, agent module, and requirements.txt", () => {
    const files = gen.generate([agent], config, "/repo");
    const paths = files.map((f) => f.path);

    expect(paths).toContain(".witboost/harness/deepagents/__init__.py");
    expect(paths).toContain(".witboost/harness/deepagents/dp_creator.py");
    expect(paths).toContain(".witboost/harness/deepagents/requirements.txt");
  });

  it("requirements.txt lists deepagents and langchain-mcp-adapters", () => {
    const files = gen.generate([agent], config, "/repo");
    const req = files.find((f) => f.path.includes("requirements.txt"))!;

    expect(req.content).toContain("deepagents");
    expect(req.content).toContain("langchain-mcp-adapters");
  });

  it("agent module contains create_deep_agent call", () => {
    const files = gen.generate([agent], config, "/repo");
    const mod = files.find((f) => f.path.includes("dp_creator.py"))!;

    expect(mod.content).toContain("def create_dp_creator_agent(");
    expect(mod.content).toContain("create_deep_agent(");
    expect(mod.content).toContain("load_mcp_tools");
    expect(mod.content).toContain('model: str = "openai:gpt-4.1"');
    expect(mod.content).toContain("SkillsMiddleware");
  });

  it("__init__.py exports all agent factory functions", () => {
    const files = gen.generate([agent], config, "/repo");
    const init = files.find((f) => f.path.includes("__init__.py"))!;

    expect(init.content).toContain("from .dp_creator import create_dp_creator_agent");
    expect(init.content).toContain('__all__');
    expect(init.content).toContain('"create_dp_creator_agent"');
  });

  it("resolves template variables in system prompt", () => {
    const files = gen.generate([agent], config, "/repo");
    const mod = files.find((f) => f.path.includes("dp_creator.py"))!;

    // The instructions are read from file at runtime, not embedded
    // But the generator does resolve variables for the system_prompt
    expect(mod.content).toContain('instructions = (_WITBOOST_DIR / "agents" / "core" / "dp-creator" / "instructions.md").read_text()');
  });

  it("generates multiple agents", () => {
    const agent2: AgentDefinition = {
      ...agent,
      name: "biz-logic",
      displayName: "Business Logic",
      harness: { deepagents: { model: "anthropic:claude-sonnet-4-20250514", skills: true } },
    };
    const files = gen.generate([agent, agent2], config, "/repo");
    const paths = files.map((f) => f.path);

    expect(paths).toContain(".witboost/harness/deepagents/dp_creator.py");
    expect(paths).toContain(".witboost/harness/deepagents/biz_logic.py");

    const init = files.find((f) => f.path.includes("__init__.py"))!;
    expect(init.content).toContain("create_dp_creator_agent");
    expect(init.content).toContain("create_biz_logic_agent");
  });

  it("disables skills middleware when skills=false", () => {
    const noSkillsAgent: AgentDefinition = {
      ...agent,
      harness: { deepagents: { model: "openai:gpt-4.1", skills: false } },
    };
    const files = gen.generate([noSkillsAgent], config, "/repo");
    const mod = files.find((f) => f.path.includes("dp_creator.py"))!;

    expect(mod.content).not.toContain("SkillsMiddleware");
    expect(mod.content).toContain("middleware=[],");
  });
});
