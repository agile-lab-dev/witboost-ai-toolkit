import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTool,
  registerTools,
  getTool,
  getAllTools,
  getToolsByCategory,
  clearRegistry,
} from "../../../src/tools/registry.js";
import type { ToolDefinition } from "../../../src/tools/types.js";

function makeTool(name: string, category: ToolDefinition["category"] = "blueprints"): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    category,
    inputSchema: { type: "object", properties: {} },
    handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
  };
}

describe("Tool Registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("registers and retrieves a tool", () => {
    registerTool(makeTool("list_blueprints"));
    const tool = getTool("list_blueprints");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("list_blueprints");
  });

  it("returns undefined for unknown tools", () => {
    expect(getTool("nonexistent")).toBeUndefined();
  });

  it("rejects duplicate names", () => {
    registerTool(makeTool("list_blueprints"));
    expect(() => registerTool(makeTool("list_blueprints"))).toThrow("Duplicate tool registration");
  });

  it("rejects invalid tool names", () => {
    expect(() => registerTool(makeTool("Invalid-Name"))).toThrow("Invalid tool name");
    expect(() => registerTool(makeTool("123start"))).toThrow("Invalid tool name");
    expect(() => registerTool(makeTool("has space"))).toThrow("Invalid tool name");
  });

  it("lists all registered tools", () => {
    registerTools([makeTool("tool_a"), makeTool("tool_b"), makeTool("tool_c")]);
    expect(getAllTools()).toHaveLength(3);
  });

  it("filters by category", () => {
    registerTools([
      makeTool("tool_a", "blueprints"),
      makeTool("tool_b", "data-products"),
      makeTool("tool_c", "blueprints"),
    ]);
    expect(getToolsByCategory("blueprints")).toHaveLength(2);
    expect(getToolsByCategory("data-products")).toHaveLength(1);
    expect(getToolsByCategory("governance")).toHaveLength(0);
  });

  it("registers multiple tools atomically", () => {
    registerTools([makeTool("tool_a"), makeTool("tool_b")]);
    expect(getAllTools()).toHaveLength(2);
  });
});
