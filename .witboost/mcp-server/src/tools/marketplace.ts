import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolResult, ToolContext } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

// ── Search API types ────────────────────────────────────────────────────

interface SearchDocument {
  title?: string;
  text?: string;
  location?: string;
  documentId?: string | number;
  external_id?: string;
  name?: string;
  version?: string;
  description?: string;
  kind?: string;
  type?: string;
  outputPortType?: string;
  technology?: string;
  platform?: string;
  tags?: any[];
  dataContract?: any;
  sampleData?: { columns?: string[]; rows?: any[][] };
  _computedInfo?: {
    urn?: string;
    kind?: string;
    environment?: string;
    domain?: { name?: string; external_id?: string };
    taxonomy?: { name?: string; external_id?: string };
    owner?: { ref?: string; displayName?: string };
    consumable?: boolean;
    publishedAt?: string;
    in_data_contract_lineage?: boolean;
    system_urn?: string;
    parent?: string;
  };
  [key: string]: any;
}

interface SearchResponse {
  results: Array<{ type: string; document: SearchDocument }>;
  nextPageCursor?: string;
  previousPageCursor?: string;
}

// ── Search API helper ───────────────────────────────────────────────────

async function searchQuery(
  ctx: ToolContext,
  body: {
    term?: string;
    types?: string[];
    filters?: Record<string, unknown>;
    pageLimit?: number;
    pageCursor?: string;
  },
): Promise<{ ok: true; data: SearchResponse } | { ok: false; error: string }> {
  const res = await ctx.api.post<SearchResponse>("/api/search/query", body);
  if (!res.ok) return { ok: false, error: res.error?.message ?? "Search API error" };
  return { ok: true, data: res.data };
}

// ── Data contract helper ────────────────────────────────────────────────

interface DataContractResponse {
  identifier: { externalId: string; environment: string };
  guardianPolicyId: string;
}

async function fetchDataContract(
  ctx: ToolContext,
  externalId: string,
  environment: string,
): Promise<string | undefined> {
  const res = await ctx.api.get<DataContractResponse>(
    `/api/marketplace/v1/data-contracts/${encodeURIComponent(externalId)}`,
    { environment },
  );
  if (!res.ok || !res.data?.guardianPolicyId) return undefined;
  return res.data.guardianPolicyId;
}

// ── URN helpers ────────────────────────────────────────────────────────

/** Extract a searchable name from a Witboost URN for use as search term */
function nameFromUrn(urn: string): string {
  const parts = urn.split(":");
  // urn:dmb:dp:domain:name:version   → index 4
  // urn:dmb:cmp:domain:dp:ver:...    → last segment (entity name)
  // urn:dmb:sys:domain:name:version  → index 4
  if ((parts[2] === "dp" || parts[2] === "sys") && parts.length >= 6) return parts[4];
  if (parts[2] === "cmp" && parts.length >= 5) return parts[parts.length - 1];
  return parts[parts.length - 1];
}

// ── Formatters ──────────────────────────────────────────────────────────

function formatSearchResult(doc: SearchDocument): string {
  const info = doc._computedInfo ?? {};
  const lines = [
    `### ${doc.title ?? "—"}`,
    "",
    `- **External ID**: \`${info.urn ?? doc.external_id ?? "—"}\``,
    `- **Domain**: ${info.domain?.name ?? "—"}`,
    `- **Owner**: ${info.owner?.displayName ?? info.owner?.ref ?? "—"}`,
    `- **Environment**: ${info.environment ?? "—"}`,
    `- **Consumable**: ${info.consumable ?? "—"}`,
    `- **Published**: ${info.publishedAt ?? "—"}`,
  ];
  if (doc.description) lines.push(`- **Description**: ${doc.description}`);
  return lines.join("\n");
}

function formatDataProduct(doc: SearchDocument): string {
  const info = doc._computedInfo ?? {};
  const lines = [
    `# ${doc.title ?? doc.name ?? "—"}`,
    "",
    `- **External ID**: \`${info.urn ?? doc.external_id ?? "—"}\``,
    `- **Version**: ${doc.version ?? "—"}`,
    `- **Domain**: ${info.domain?.name ?? "—"}`,
    `- **Owner**: ${info.owner?.displayName ?? info.owner?.ref ?? "—"}`,
    `- **Environment**: ${info.environment ?? "—"}`,
    `- **Taxonomy**: ${info.taxonomy?.name ?? "—"}`,
    `- **Consumable**: ${info.consumable ?? "—"}`,
    `- **In data contract lineage**: ${info.in_data_contract_lineage ?? "—"}`,
    `- **Published**: ${info.publishedAt ?? "—"}`,
  ];
  if (doc.description) lines.push(`- **Description**: ${doc.description}`);
  if (doc.tags?.length) {
    const tags = doc.tags.map((t: any) => t.tagFQN ?? t).filter(Boolean).join(", ");
    if (tags) lines.push(`- **Tags**: ${tags}`);
  }
  return lines.join("\n");
}

function formatOutputPortSummary(doc: SearchDocument): string {
  const info = doc._computedInfo ?? {};
  const title = doc.title ?? doc.name ?? "—";
  const lines = [
    `- **${title}**`,
    `  - External ID: \`${info.urn ?? doc.external_id ?? "—"}\``,
    `  - Kind: ${doc.kind ?? "—"} | Type: ${doc.outputPortType ?? doc.type ?? "—"}`,
    `  - Version: ${doc.version ?? "—"}`,
    `  - Consumable: ${info.consumable ?? "—"}`,
  ];
  if (doc.description && doc.description !== title) lines.push(`  - ${doc.description}`);
  return lines.join("\n");
}

function formatOutputPort(doc: SearchDocument, guardianPolicyId?: string): string {
  const info = doc._computedInfo ?? {};
  const dc = doc.dataContract ?? {};
  const title = doc.title ?? doc.name ?? "—";

  const lines = [
    `### ${title}`,
    "",
    `- **External ID**: \`${info.urn ?? doc.external_id ?? "—"}\``,
    `- **Kind**: ${doc.kind ?? "—"}`,
    `- **Type**: ${doc.outputPortType ?? doc.type ?? "—"}`,
    `- **Version**: ${doc.version ?? "—"}`,
    `- **Consumable**: ${info.consumable ?? "—"}`,
    `- **Environment**: ${info.environment ?? "—"}`,
  ];

  if (doc.description && doc.description !== title) lines.push(`- **Description**: ${doc.description}`);
  if (doc.technology) lines.push(`- **Technology**: ${doc.technology}`);
  if (doc.platform) lines.push(`- **Platform**: ${doc.platform}`);
  if (guardianPolicyId) lines.push(`- **Data contract policy**: ${guardianPolicyId}`);
  const parentVal = info.parent;
  const parentStr = typeof parentVal === "string" ? parentVal
    : parentVal && typeof parentVal === "object" ? ((parentVal as any).display_name ?? undefined)
    : undefined;
  if (parentStr) lines.push(`- **Parent system**: ${parentStr}`);

  if (dc.SLA) {
    const sla = dc.SLA;
    const parts: string[] = [];
    if (sla.upTime) parts.push(`uptime: ${sla.upTime}`);
    if (sla.timeliness) parts.push(`timeliness: ${sla.timeliness}`);
    if (sla.intervalOfChange) parts.push(`interval: ${sla.intervalOfChange}`);
    if (parts.length) lines.push(`- **SLA**: ${parts.join(", ")}`);
  }

  if (dc.schema?.length) {
    lines.push("", "**Schema**:", "");
    lines.push("| Column | Type | Description | Tags |");
    lines.push("|--------|------|-------------|------|");
    for (const col of dc.schema) {
      const colTags = (col.tags ?? []).map((t: any) => t.tagFQN).filter(Boolean).join(", ");
      lines.push(`| ${col.name ?? "—"} | ${col.dataType ?? col.type ?? "—"} | ${col.description ?? "—"} | ${colTags || "—"} |`);
    }
  }

  if (doc.sampleData?.columns?.length) {
    lines.push("", "**Sample Data** (first 3 rows):", "");
    lines.push("| " + doc.sampleData.columns.join(" | ") + " |");
    lines.push("| " + doc.sampleData.columns.map(() => "---").join(" | ") + " |");
    const rows = (doc.sampleData.rows ?? []).slice(0, 3);
    for (const row of rows) {
      lines.push("| " + row.join(" | ") + " |");
    }
  }

  return lines.join("\n");
}

// ── Tool definitions ────────────────────────────────────────────────────

const marketplaceTools: ToolDefinition[] = [
  {
    name: "marketplace_search",
    description:
      "Search for data products in the Witboost Marketplace. " +
      "Returns consumable entities matching a text query. " +
      "Use this to discover available data products and their metadata. " +
      "Results include External ID (URN) — use it with marketplace_get_data_product.",
    category: "marketplace",
    inputSchema: {
      type: "object",
      properties: {
        term: {
          type: "string",
          description: "Search term (e.g. 'customer', 'finance', 'fraud')",
        },
        environment: {
          type: "string",
          description: "Filter by environment (e.g. 'production', 'development'). Defaults to 'production'.",
          default: "production",
        },
        pageLimit: {
          type: "number",
          description: "Max results per page (default 15)",
          default: 15,
        },
        pageCursor: {
          type: "string",
          description: "Pagination cursor from a previous search result. Omit for first page.",
        },
      },
      required: ["term"],
    },
    async handler(params, ctx) {
      const term = params.term as string;
      const environment = (params.environment as string) ?? "production";
      const pageLimit = (params.pageLimit as number) ?? 15;
      const pageCursor = params.pageCursor as string | undefined;

      const res = await searchQuery(ctx, {
        term,
        types: ["marketplace-projects"],
        pageLimit,
        pageCursor,
      });

      if (!res.ok) return apiError("SEARCH_ERROR", res.error);

      // Filter by environment client-side
      const allDocs = (res.data.results ?? []).map((r) => r.document);
      const docs = allDocs.filter(
        (doc) => !environment || (doc._computedInfo?.environment ?? "") === environment,
      );

      if (docs.length === 0) {
        return text(`No marketplace results found for "${term}" in ${environment}.`);
      }

      const sections = docs.map(formatSearchResult);
      const header = `# Marketplace Search: "${term}" (${docs.length} results)\n\n**Environment**: ${environment}`;
      const nextCursor = res.data.nextPageCursor;
      const footer = nextCursor
        ? `\n---\n_More results available. Pass \`pageCursor: "${nextCursor}"\` for the next page._`
        : "";

      return text([header, "", sections.join("\n\n---\n\n")].join("\n") + footer);
    },
  },

  {
    name: "marketplace_get_data_product",
    description:
      "Get full details of a data product from the Witboost Marketplace, " +
      "including domain, owner, taxonomy, environment, tags, and consumability. " +
      "Input: the External ID (URN) from marketplace_search results, " +
      "e.g. 'urn:dmb:dp:consulting:customer-growth-tool:0'.",
    category: "marketplace",
    inputSchema: {
      type: "object",
      properties: {
        externalId: {
          type: "string",
          description: "External ID (URN) of the data product from marketplace_search",
        },
        environment: {
          type: "string",
          description: "Environment (e.g. 'production', 'development'). Defaults to 'production'.",
          default: "production",
        },
      },
      required: ["externalId"],
    },
    async handler(params, ctx) {
      const externalId = params.externalId as string;
      const environment = (params.environment as string) ?? "production";

      const res = await searchQuery(ctx, {
        term: nameFromUrn(externalId),
        types: ["marketplace-projects"],
        pageLimit: 10,
      });

      if (!res.ok) return apiError("SEARCH_ERROR", res.error);

      const docs = (res.data.results ?? []).map((r) => r.document);
      const doc =
        docs.find(
          (d) =>
            (d._computedInfo?.urn ?? d.external_id) === externalId &&
            (!environment || (d._computedInfo?.environment ?? "") === environment),
        ) ?? docs.find((d) => (d._computedInfo?.urn ?? d.external_id) === externalId);

      if (!doc) {
        return text(`No data product found with External ID: ${externalId}`, true);
      }

      return text(formatDataProduct(doc));
    },
  },

  {
    name: "marketplace_get_output_ports",
    description:
      "Get the output ports (consumable interfaces) of a data product in the Witboost Marketplace. " +
      "Returns all output port components with kind, type, version, consumability, and description. " +
      "Input: the External ID (URN) of the data product from marketplace_search results.",
    category: "marketplace",
    inputSchema: {
      type: "object",
      properties: {
        externalId: {
          type: "string",
          description: "External ID (URN) of the data product, e.g. 'urn:dmb:dp:consulting:customer-growth-tool:0'",
        },
        environment: {
          type: "string",
          description: "Environment (e.g. 'production', 'development'). Defaults to 'production'.",
          default: "production",
        },
      },
      required: ["externalId"],
    },
    async handler(params, ctx) {
      const externalId = params.externalId as string;
      const environment = (params.environment as string) ?? "production";

      // Fetch all marketplace items (DPs + components) and filter client-side.
      // Components use different display names than the parent DP name,
      // so we use empty term and paginate to collect all.
      const allDocs: SearchDocument[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < 5; page++) {
        const res = await searchQuery(ctx, {
          term: "",
          types: ["marketplace-projects"],
          pageLimit: 100,
          pageCursor: cursor,
        });
        if (!res.ok) return apiError("SEARCH_ERROR", res.error);

        allDocs.push(...(res.data.results ?? []).map((r) => r.document));
        cursor = res.data.nextPageCursor;
        if (!cursor) break;
      }

      // Filter: component-level items belonging to this DP
      const docs = allDocs.filter(
        (d) =>
          (d._computedInfo?.kind ?? "") === "component" &&
          (d._computedInfo?.system_urn ?? "") === externalId &&
          (!environment || (d._computedInfo?.environment ?? "") === environment),
      );

      if (docs.length === 0) {
        return text(
          `No output ports found for data product: ${externalId} in ${environment}. ` +
          `Ensure the data product is published in the marketplace.`,
          true,
        );
      }

      const dpName = typeof docs[0]._computedInfo?.parent === "string"
        ? docs[0]._computedInfo.parent
        : externalId;
      const header = `# Output Ports — ${dpName}\n\n**Components**: ${docs.length}`;
      const sections = docs.map(formatOutputPortSummary);

      return text([header, "", ...sections].join("\n"));
    },
  },

  {
    name: "marketplace_get_output_port",
    description:
      "Get full details of a specific output port from the Witboost Marketplace, " +
      "including descriptor, data contract schema, SLA, sample data, technology, and tags. " +
      "Input: the External ID (URN) of the output port from marketplace_get_output_ports results.",
    category: "marketplace",
    inputSchema: {
      type: "object",
      properties: {
        externalId: {
          type: "string",
          description: "External ID (URN) of the output port, e.g. 'urn:dmb:cmp:consulting:customer-growth-tool:0:customers-op'",
        },
        environment: {
          type: "string",
          description: "Environment (e.g. 'production', 'development'). Defaults to 'production'.",
          default: "production",
        },
      },
      required: ["externalId"],
    },
    async handler(params, ctx) {
      const externalId = params.externalId as string;
      const environment = (params.environment as string) ?? "production";

      const res = await searchQuery(ctx, {
        term: nameFromUrn(externalId),
        types: ["marketplace-projects"],
        pageLimit: 10,
      });

      if (!res.ok) return apiError("SEARCH_ERROR", res.error);

      const docs = (res.data.results ?? []).map((r) => r.document);
      const doc =
        docs.find(
          (d) =>
            (d._computedInfo?.urn ?? d.external_id) === externalId &&
            (!environment || (d._computedInfo?.environment ?? "") === environment),
        ) ?? docs.find((d) => (d._computedInfo?.urn ?? d.external_id) === externalId);

      if (!doc) {
        return text(`No output port found with External ID: ${externalId}`, true);
      }

      // Fetch guardian policy id from marketplace REST API
      const urn = doc._computedInfo?.urn ?? doc.external_id ?? externalId;
      const guardianPolicyId = await fetchDataContract(ctx, urn, environment);

      return text(formatOutputPort(doc, guardianPolicyId));
    },
  },
];

registerTools(marketplaceTools);
