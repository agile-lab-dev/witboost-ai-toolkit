import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

const provisioningTools: ToolDefinition[] = [
  {
    name: "deploy",
    description: "Deploy a data product to a target environment",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
        environment: { type: "string", description: "Target environment name" },
        confirm: { type: "boolean", description: "Must be true to confirm deployment" },
      },
      required: ["dataProductId", "environment", "confirm"],
    },
    async handler(params, ctx) {
      if (params.confirm !== true) {
        return text("[CONFIRMATION_REQUIRED] Set confirm: true to deploy this data product.", true);
      }

      const dpId = params.dataProductId as string;
      const environment = params.environment as string;

      const res = await ctx.api.post<any>("/api/provisioning/deploy", {
        dataProductId: dpId,
        environment,
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      return text(
        `Deployment initiated.\n- **Data Product**: ${dpId}\n- **Environment**: ${environment}\n- **Deployment ID**: ${res.data?.id ?? "—"}\n- **Status**: ${res.data?.status ?? "pending"}`,
      );
    },
  },
  {
    name: "undeploy",
    description: "Undeploy a data product from an environment",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
        environment: { type: "string", description: "Environment to undeploy from" },
        confirm: { type: "boolean", description: "Must be true to confirm undeployment" },
      },
      required: ["dataProductId", "environment", "confirm"],
    },
    async handler(params, ctx) {
      if (params.confirm !== true) {
        return text("[CONFIRMATION_REQUIRED] Set confirm: true to undeploy.", true);
      }

      const dpId = params.dataProductId as string;
      const environment = params.environment as string;

      const res = await ctx.api.post<any>("/api/provisioning/undeploy", {
        dataProductId: dpId,
        environment,
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      return text(
        `Undeployment initiated.\n- **Data Product**: ${dpId}\n- **Environment**: ${environment}`,
      );
    },
  },
  {
    name: "get_deployment_status",
    description: "Get the current status of a deployment",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
        environment: { type: "string", description: "Environment name (optional — returns all if omitted)" },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;
      const environment = params.environment as string | undefined;

      const query: Record<string, string | undefined> = { environment };
      const res = await ctx.api.get<any>(`/api/provisioning/status/${dpId}`, query);

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const statuses = Array.isArray(res.data) ? res.data : [res.data];
      const lines = statuses.map((s: any) => {
        return [
          `### ${s.environment ?? "—"}`,
          `- **Status**: ${s.status}`,
          `- **Started**: ${s.startedAt ?? "—"}`,
          s.completedAt ? `- **Completed**: ${s.completedAt}` : null,
          s.errors?.length ? `- **Errors**: ${s.errors.join("; ")}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      });

      return text(`Deployment status for **${dpId}**:\n\n${lines.join("\n\n")}`);
    },
  },
  {
    name: "get_deployment_logs",
    description: "Retrieve provisioning logs for a deployment",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
        environment: { type: "string", description: "Environment name" },
        componentId: { type: "string", description: "Filter by component (optional)" },
        tail: { type: "number", description: "Number of recent log lines (default: 100)" },
      },
      required: ["dataProductId", "environment"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;
      const environment = params.environment as string;
      const componentId = params.componentId as string | undefined;
      const tail = (params.tail as number) ?? 100;

      const res = await ctx.api.get<any>(`/api/provisioning/logs/${dpId}`, {
        environment,
        componentId,
        tail,
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const logs = Array.isArray(res.data) ? res.data : res.data?.logs ?? [];
      if (logs.length === 0) return text("No logs found.");

      const logLines = logs.map((entry: any) => {
        if (typeof entry === "string") return entry;
        const ts = entry.timestamp ?? "";
        const level = entry.level ?? "INFO";
        const msg = entry.message ?? "";
        return `[${ts}] [${level}] ${msg}`;
      });

      return text(`Deployment logs for **${dpId}** (${environment}):\n\n\`\`\`\n${logLines.join("\n")}\n\`\`\``);
    },
  },
];

registerTools(provisioningTools);
