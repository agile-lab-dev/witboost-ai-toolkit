import type { ToolDefinition, ToolCategory } from "./types.js";

const tools = new Map<string, ToolDefinition>();

/** Register a tool definition. Throws if name is already taken. */
export function registerTool(tool: ToolDefinition): void {
  if (tools.has(tool.name)) {
    throw new Error(`Duplicate tool registration: ${tool.name}`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    throw new Error(
      `Invalid tool name: ${tool.name} — must match ^[a-z][a-z0-9_]*$`,
    );
  }
  tools.set(tool.name, tool);
}

/** Register multiple tools at once */
export function registerTools(defs: ToolDefinition[]): void {
  for (const tool of defs) {
    registerTool(tool);
  }
}

/** Get a tool by name */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

/** Get all registered tools */
export function getAllTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

/** Get tools filtered by category */
export function getToolsByCategory(category: ToolCategory): ToolDefinition[] {
  return getAllTools().filter((t) => t.category === category);
}

/** Clear all registered tools (for testing) */
export function clearRegistry(): void {
  tools.clear();
}
