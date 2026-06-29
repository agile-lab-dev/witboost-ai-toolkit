import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { WitboostConfig } from "../config/schema.js";
import { WitboostApiClient } from "../api/client.js";
import { getAllTools } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";

export function createServer(config: WitboostConfig): Server {
  const server = new Server(
    { name: "witboost-ai-toolkit", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const api = new WitboostApiClient(config);
  const context: ToolContext = { config, api };

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = getAllTools();
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  // Handle tool invocations
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === name);

    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(args ?? {}, context);
      return {
        content: result.content,
        isError: result.isError ?? false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Tool error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}
