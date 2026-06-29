import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolResult, ToolContext } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

/** Resolve the Hasura GraphQL URL: explicit config, or derived from base URL (ui.X → hasura.X) */
function hasuraUrl(ctx: ToolContext): string {
  if (ctx.config.hasuraUrl) return ctx.config.hasuraUrl;
  const base = new URL(ctx.config.baseUrl);
  const host = base.host.replace(/^ui\./, "hasura.");
  return `${base.protocol}//${host}/v1/graphql`;
}

/** GraphQL fields shared by all policy queries */
const POLICY_FIELDS = `
    governance_entity_id
    name
    description
    engine
    timing
    trigger
    status
    resource_type { name displayName: display_name }
    content
    selector
    preprocessing
    interaction_type
    additional_metadata
    result_type
    governance_entity_environments { environment { name } }
    governance_entity_tags { tag { name } }
`;

/** Execute a Hasura GraphQL query */
async function graphql(
  ctx: ToolContext,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const bearerToken = ctx.config.hasuraJwt ?? await ctx.api.getBearerToken();
  const response = await fetch(hasuraUrl(ctx), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operationName, variables, query }),
  });
  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status}: ${await response.text()}` };
  }
  const result = await response.json() as any;
  if (result.errors?.length) {
    return { ok: false, error: result.errors.map((e: any) => e.message).join("; ") };
  }
  return { ok: true, data: result.data };
}

/** Format a single policy entity into readable markdown */
function formatPolicy(p: any): string {
  const envs = (p.governance_entity_environments ?? [])
    .map((e: any) => e.environment?.name)
    .filter(Boolean)
    .join(", ");
  const tags = (p.governance_entity_tags ?? [])
    .map((t: any) => t.tag?.name)
    .filter(Boolean)
    .join(", ");

  const lines = [
    `## ${p.name}`,
    "",
    `**ID**: \`${p.governance_entity_id}\``,
    `**Description**: ${p.description ?? "—"}`,
    `**Engine**: ${p.engine} | **Timing**: ${p.timing} | **Status**: ${p.status}`,
    `**Resource type**: ${p.resource_type?.displayName ?? p.resource_type?.name ?? "—"}`,
    `**Environments**: ${envs || "—"}`,
    `**Result type**: ${p.result_type ?? "—"}`,
  ];

  if (tags) lines.push(`**Tags**: ${tags}`);

  if (p.content) {
    if (p.content.cueScript) {
      lines.push("", "### CUE Script", "```cue", p.content.cueScript, "```");
    }
    if (p.content.governanceAgentSpec) {
      lines.push(
        "",
        "### Governance Agent",
        `**Prompt**: ${p.content.governanceAgentSpec.prompt}`,
      );
    }
    if (p.content.severity) {
      lines.push(`**Severity**: ${p.content.severity}`);
    }
    if (p.content.externalUrl) {
      lines.push(`**External URL**: ${p.content.externalUrl}`);
    }
    if (p.content.thresholds) {
      lines.push("**Thresholds**:", "```json", JSON.stringify(p.content.thresholds, null, 2), "```");
    }
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

      let query: string;
      let variables: Record<string, unknown>;

      if (ids && ids.length > 0) {
        query = `query GOVERNANCE_ENTITIES($ids: [String!]!) {
  cgp_governance_entity(where: {governance_entity_id: {_in: $ids}}) {${POLICY_FIELDS}  }
}`;
        variables = { ids };
      } else {
        query = `query ALL_POLICIES {
  cgp_governance_entity(where: {trigger: {_eq: "active"}, result_type: {_eq: "policy"}}, order_by: {name: asc}) {${POLICY_FIELDS}  }
}`;
        variables = {};
      }

      const res = await graphql(ctx, ids ? "GOVERNANCE_ENTITIES" : "ALL_POLICIES", query, variables);
      if (!res.ok) return apiError("HASURA_ERROR", res.error);

      const entities = res.data?.cgp_governance_entity ?? [];
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

      const query = `query GET_POLICY_BY_POLICY_ID($policyId: String!) {
  cgp_governance_entity(where: {governance_entity_id: {_eq: $policyId}}) {${POLICY_FIELDS}  }
}`;

      const res = await graphql(ctx, "GET_POLICY_BY_POLICY_ID", query, { policyId });
      if (!res.ok) return apiError("HASURA_ERROR", res.error);

      const entities = res.data?.cgp_governance_entity ?? [];
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
      const query = `query DESCRIPTOR_SPEC {
  cgp_governance_entity(where: {name: {_eq: "Global specification compliance"}}) {${POLICY_FIELDS}  }
}`;

      const res = await graphql(ctx, "DESCRIPTOR_SPEC", query, {});
      if (!res.ok) return apiError("HASURA_ERROR", res.error);

      const entities = res.data?.cgp_governance_entity ?? [];
      if (entities.length === 0) {
        return text(
          "No 'Global specification compliance' policy found. " +
          "Ask the platform administrator to create it.",
          true,
        );
      }

      const policy = entities[0];
      const cue = policy.content?.cueScript ?? "";
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
