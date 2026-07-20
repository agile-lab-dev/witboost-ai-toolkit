import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolResult, ToolContext } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

/** Resolve the WCG REST base URL: explicit config, or derived from base URL (ui.X → wcg.X) */
function wcgBaseUrl(ctx: ToolContext): string {
  if (ctx.config.wcgUrl) return ctx.config.wcgUrl;
  const base = new URL(ctx.config.baseUrl);
  const host = base.host.replace(/^ui\./, "wcg.");
  return `${base.protocol}//${host}/governance-platform`;
}

/** WCG paginated list response envelope */
interface WcgListResponse {
  data: any[];
  meta: { pagination: { limit: number; offset: number; total: number } };
}

/** Perform a GET request against the WCG REST API */
async function wcgGet<T>(
  ctx: ToolContext,
  path: string,
  params?: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const base = wcgBaseUrl(ctx);
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const bearerToken = await ctx.api.getBearerToken();
  try {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${await response.text()}` };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Format a single policy entity (WCG REST GovernanceEntityResponseModel) into readable markdown */
function formatPolicy(p: any): string {
  const lines = [
    `## ${p.name}`,
    "",
    `**ID**: \`${p.id}\``,
    `**Description**: ${p.description ?? "—"}`,
    `**Engine**: ${p.engine} | **Timing**: ${p.timing} | **Status**: ${p.status}`,
    `**Resource type**: ${p.resourceType ?? "—"}`,
    `**Environment**: ${p.environment || "—"}`,
    `**Interaction type**: ${p.interactionType ?? "—"}`,
  ];

  if (p.tags?.length) lines.push(`**Tags**: ${(p.tags as string[]).join(", ")}`);
  if (p.severity) lines.push(`**Severity**: ${p.severity}`);
  if (p.externalUrl) lines.push(`**External URL**: ${p.externalUrl}`);

  if (p.cueScript) {
    lines.push("", "### CUE Script", "```cue", p.cueScript, "```");
  }
  if (p.governanceAgentSpec) {
    lines.push("", "### Governance Agent");
    if (p.governanceAgentSpec.prompt) lines.push(`**Prompt**: ${p.governanceAgentSpec.prompt}`);
  }
  if (p.thresholds) {
    lines.push("**Thresholds**:", "```json", JSON.stringify(p.thresholds, null, 2), "```");
  }

  return lines.join("\n");
}

const governanceTools: ToolDefinition[] = [
  {
    name: "list_policies",
    description:
      "List all governance policies with their full definitions (CUE scripts, agent prompts, thresholds). " +
      "Use this BEFORE validating a data product to understand what the policies expect, " +
      "or after validation fails to understand what each policy checks. " +
      "Optionally filter by policy IDs to fetch only specific ones.",
    category: "governance",
    inputSchema: {
      type: "object",
      properties: {
        policyIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional list of governance_entity_id UUIDs to fetch. " +
            "If omitted, returns all active policies.",
        },
      },
    },
    async handler(params, ctx) {
      const ids = params.policyIds as string[] | undefined;

      const query: Record<string, string> = {
        status: "enabled,grace",
        trigger: "active",
        limit: "200",
        "sort-by": "name",
        "sort-order": "asc",
      };
      if (ids?.length) query["id-in"] = ids.join(",");

      const res = await wcgGet<WcgListResponse>(ctx, "/v1/computational-governance/policies", query);
      if (!res.ok) return apiError("WCG_ERROR", res.error);

      const entities = res.data.data ?? [];
      if (entities.length === 0) {
        return text(ids ? "No policies found for the given IDs." : "No active policies found.");
      }

      const header = ids
        ? `# Policies (${entities.length} found)\n`
        : `# All Active Policies (${entities.length})\n`;

      const sections = entities.map(formatPolicy);
      return text(header + "\n" + sections.join("\n\n---\n\n"));
    },
  },
  {
    name: "get_policy",
    description:
      "Retrieve the full definition of a governance policy by its ID. " +
      "Returns the policy name, description, engine, content (CUE script or agent spec), " +
      "timing, environments, and status. Use this to understand what a failing policy expects.",
    category: "governance",
    inputSchema: {
      type: "object",
      properties: {
        policyId: {
          type: "string",
          description: "The governance_entity_id (UUID) of the policy to retrieve",
        },
      },
      required: ["policyId"],
    },
    async handler(params, ctx) {
      const policyId = params.policyId as string;

      const res = await wcgGet<WcgListResponse>(ctx, "/v1/computational-governance/policies", {
        "id-in": policyId,
        limit: "1",
      });
      if (!res.ok) return apiError("WCG_ERROR", res.error);

      const entities = res.data.data ?? [];
      if (entities.length === 0) {
        return text(`No policy found with ID: ${policyId}`, true);
      }

      return text(formatPolicy(entities[0]));
    },
  },
  {
    name: "check_policies",
    description: "Check a data product against governance policies",
    category: "governance",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;

      const res = await ctx.api.get<any>(`/api/governance/policies/${dpId}`);
      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const policies = res.data?.policies ?? [];
      if (policies.length === 0) return text("No governance policies found for this data product.");

      const passed = policies.filter((p: any) => p.status === "passed").length;
      const failed = policies.filter((p: any) => p.status !== "passed").length;

      const lines = [
        `Policy check: **${passed}** passed, **${failed}** failed\n`,
      ];

      for (const p of policies) {
        const icon = p.status === "passed" ? "✅" : p.status === "warning" ? "⚠️" : "❌";
        lines.push(`- ${icon} **${p.name ?? p.policyId}**: ${p.message ?? p.status}`);
        if (p.remediation) lines.push(`  💡 Remediation: ${p.remediation}`);
      }

      return text(lines.join("\n"));
    },
  },
  {
    name: "get_approval_status",
    description: "Get the approval status of a data product",
    category: "governance",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;

      const res = await ctx.api.get<any>(`/api/governance/approvals/${dpId}`);
      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const approvals = res.data?.approvals ?? [];
      if (approvals.length === 0) return text("No pending approvals for this data product.");

      const lines = [`Approval status for **${dpId}**:\n`];

      for (const a of approvals) {
        const icon = a.status === "approved" ? "✅" : a.status === "rejected" ? "❌" : "⏳";
        lines.push(`- ${icon} **${a.approver ?? "—"}**: ${a.status}`);
        if (a.timestamp) lines.push(`  Date: ${a.timestamp}`);
        if (a.comment) lines.push(`  Comment: ${a.comment}`);
      }

      return text(lines.join("\n"));
    },
  },
  {
    name: "get_descriptor_specification",
    description:
      "Retrieve the Data Product Descriptor Specification — a CUE schema that defines " +
      "the exact structure and constraints for data product descriptors (YAML). " +
      "Call this BEFORE creating or editing any data product to understand the required " +
      "fields, types, and validation rules for the DP, its output ports, storage, " +
      "and workload components. The CUE schema is the single source of truth for " +
      "descriptor format — follow it strictly.",
    category: "governance",
    inputSchema: { type: "object", properties: {} },
    async handler(_params, ctx) {
      const res = await wcgGet<WcgListResponse>(ctx, "/v1/computational-governance/policies", {
        text: "Global specification compliance",
        limit: "5",
      });
      if (!res.ok) return apiError("WCG_ERROR", res.error);

      const entities = res.data.data ?? [];
      const policy = entities.find((e: any) => e.name === "Global specification compliance");
      if (!policy) {
        return text(
          "No 'Global specification compliance' policy found. " +
          "Ask the platform administrator to create it.",
          true,
        );
      }

      const cue = policy.cueScript ?? "";
      if (!cue) {
        return text("The specification policy exists but has no CUE script.", true);
      }

      return text(
        "# Data Product Descriptor Specification\n\n" +
        "This CUE schema defines the exact structure for data product descriptors. " +
        "Use it as the authoritative reference when building or editing descriptors.\n\n" +
        "```cue\n" + cue + "\n```",
      );
    },
  },
];

registerTools(governanceTools);
