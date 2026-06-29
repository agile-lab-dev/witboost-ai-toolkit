import type { WitboostConfig } from "../config/schema.js";
import type { WitboostApiClient } from "../api/client.js";

/** JSON Schema type for tool input definitions */
export type JSONSchema = Record<string, unknown>;

/** Tool functional categories */
export type ToolCategory =
  | "blueprints"
  | "data-products"
  | "components"
  | "repositories"
  | "provisioning"
  | "testing"
  | "governance"
  | "marketplace";

/** Context passed to every tool handler */
export interface ToolContext {
  config: WitboostConfig;
  api: WitboostApiClient;
}

/** Content item in a tool result */
export type ToolContent =
  | { type: "text"; text: string }
  | { type: "resource"; resource: { uri: string; mimeType: string; text: string } };

/** Standardized return type from every tool handler */
export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

/** Definition of a single MCP tool */
export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: JSONSchema;
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}
