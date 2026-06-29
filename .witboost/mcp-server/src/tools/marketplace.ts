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
  const result = (await response.json()) as any;
  if (result.errors?.length) {
    return { ok: false, error: result.errors.map((e: any) => e.message).join("; ") };
  }
  return { ok: true, data: result.data };
}

// ── Search via GraphQL ───────────────────────────────────────────────────

const SEARCH_INSTANCES_QUERY = `query SearchMarketplace($where: marketplace_instances_bool_exp!, $limit: Int!, $offset: Int!) {
  instances: marketplace_instances(
    where: $where,
    limit: $limit,
    offset: $offset,
    order_by: [{display_name: asc}, {id: asc}]
  ) {
    id
    name
    display_name
    external_id
    kind
    type
    version
    description
    consumable
    shoppable
    published_at
    owner_display_name
    environment {
      name
    }
    domains: relations(where: {name: {_eq: "partOfDomain"}}) {
      data: instanceByTargetInstanceId {
        name
      }
    }
  }
  total: marketplace_instances_aggregate(where: $where) {
    aggregate {
      count
    }
  }
}`;

function formatSearchResult(instance: any): string {
  const domain = (instance.domains ?? []).map((d: any) => d.data?.name).filter(Boolean).join(", ");
  const lines = [
    `### ${instance.display_name ?? instance.name}`,
    "",
    `- **Marketplace ID**: ${instance.id}`,
    `- **External ID**: \`${instance.external_id}\``,
    `- **Kind**: ${instance.kind ?? "—"} | **Type**: ${instance.type ?? "—"}`,
    `- **Version**: ${instance.version ?? "—"}`,
    `- **Domain**: ${domain || "—"}`,
    `- **Owner**: ${instance.owner_display_name ?? "—"}`,
    `- **Consumable**: ${instance.consumable ?? "—"}`,
  ];
  if (instance.description) lines.push(`- **Description**: ${instance.description}`);
  return lines.join("\n");
}

// ── GraphQL fragments ───────────────────────────────────────────────────

const GET_INSTANCE_BY_ID_QUERY = `query GetInstanceById($id: bigint!, $consumedDcsWhere: marketplace_relations_bool_exp, $ownedDcsWhere: marketplace_relations_bool_exp) {
  instances: marketplace_instances(where: {id: {_eq: $id}}) {
    id
    version
    descriptor
    published_at
    name
    display_name
    domains: relations(where: {name: {_eq: "partOfDomain"}}) {
      data: instanceByTargetInstanceId {
        name
        external_id
      }
    }
    description
    owner
    owner_display_name
    external_id
    taxonomy {
      id
      external_id
      name
    }
    environment {
      id
      name
    }
    shoppable
    consumable
    kind
    type
    consumedDcsCount: relations_aggregate(where: $consumedDcsWhere) {
      aggregate {
        count
      }
    }
    ownedDcsCount: relationsByTargetInstanceId_aggregate(where: $ownedDcsWhere) {
      aggregate {
        count
      }
    }
  }
}`;

const GET_OUTPUT_PORTS_QUERY = `query GetOutputPortsByInstanceId($id: bigint!) {
  instances: marketplace_instances(where: {id: {_eq: $id}}) {
    id
    description
    name
    display_name
    version
    components: relationsByTargetInstanceId(where: {name: {_eq: "partOfSystem"}}) {
      data: instance {
        id
        name
        display_name
        external_id
        kind
        type
        version
        description
        consumable
        shoppable
        descriptor
      }
    }
    shoppable
    consumable
    descriptor
  }
}`;

const GET_OUTPUT_PORT_BY_ID_QUERY = `query getOutputPortById($id: bigint, $consumableInterfaceTypeField: String!) {
  instances: marketplace_instances(where: {id: {_eq: $id}}) {
    id
    description
    name
    display_name
    version
    descriptor
    outputporttype: descriptor(path: $consumableInterfaceTypeField)
    components: relationsByTargetInstanceId(where: {name: {_eq: "partOfComponent"}}) {
      data: instance {
        id
        name
        external_id
        display_name
        type
        description
        descriptor
        version
        consumable
        shoppable
      }
    }
    external_id
    shoppable
    consumable
    published_at
    type
    kind
    environment {
      name
    }
    parentComponent: relations(where: {name: {_eq: "partOfComponent"}}) {
      data: instanceByTargetInstanceId {
        id
        display_name
        external_id
        dataContract: data_contract {
          policy_id
        }
        descriptor
        system: relations(where: {name: {_eq: "partOfSystem"}}) {
          data: instanceByTargetInstanceId {
            id
            name
            display_name
            descriptor
            version
            domain: relations(where: {name: {_eq: "partOfDomain"}}) {
              data: instanceByTargetInstanceId {
                name
                external_id
              }
            }
            environment {
              id
              name
            }
          }
        }
      }
    }
    system: relations(where: {name: {_eq: "partOfSystem"}}) {
      data: instanceByTargetInstanceId {
        id
        name
        display_name
        descriptor
        version
        domain: relations(where: {name: {_eq: "partOfDomain"}}) {
          data: instanceByTargetInstanceId {
            name
            external_id
          }
        }
        environment {
          id
          name
        }
      }
    }
    dataContract: data_contract {
      policy_id
    }
  }
}`;

// ── Formatters ──────────────────────────────────────────────────────────

function formatDataProduct(instance: any): string {
  const desc = instance.descriptor ?? {};
  const domains = (instance.domains ?? [])
    .map((d: any) => d.data?.name)
    .filter(Boolean)
    .join(", ");

  const lines = [
    `# ${instance.display_name ?? instance.name}`,
    "",
    `- **ID**: ${instance.id}`,
    `- **External ID**: \`${instance.external_id}\``,
    `- **Version**: ${instance.version ?? "—"}`,
    `- **Kind**: ${instance.kind ?? desc.kind ?? "—"}`,
    `- **Type**: ${instance.type ?? "—"}`,
    `- **Domain**: ${domains || "—"}`,
    `- **Owner**: ${instance.owner_display_name ?? instance.owner ?? "—"}`,
    `- **Environment**: ${instance.environment?.name ?? "—"}`,
    `- **Taxonomy**: ${instance.taxonomy?.name ?? "—"}`,
    `- **Shoppable**: ${instance.shoppable ?? "—"}`,
    `- **Consumable**: ${instance.consumable ?? "—"}`,
    `- **Published**: ${instance.published_at ?? "—"}`,
  ];

  if (instance.description) {
    lines.push(`- **Description**: ${instance.description}`);
  }

  const consumed = instance.consumedDcsCount?.aggregate?.count;
  const owned = instance.ownedDcsCount?.aggregate?.count;
  if (consumed !== undefined) lines.push(`- **Consumed data contracts**: ${consumed}`);
  if (owned !== undefined) lines.push(`- **Owned data contracts**: ${owned}`);

  if (desc.tags?.length) {
    const tags = desc.tags.map((t: any) => t.tagFQN).filter(Boolean).join(", ");
    if (tags) lines.push(`- **Tags**: ${tags}`);
  }

  return lines.join("\n");
}

function formatOutputPort(instance: any): string {
  const desc = instance.descriptor ?? {};

  const lines = [
    `### ${instance.display_name ?? instance.name}`,
    "",
    `- **ID**: ${instance.id}`,
    `- **External ID**: \`${instance.external_id ?? desc.id ?? "—"}\``,
    `- **Kind**: ${instance.kind ?? desc.kind ?? "—"}`,
    `- **Type**: ${instance.type ?? instance.outputporttype ?? "—"}`,
    `- **Version**: ${instance.version ?? "—"}`,
    `- **Consumable**: ${instance.consumable ?? "—"}`,
    `- **Shoppable**: ${instance.shoppable ?? "—"}`,
    `- **Environment**: ${instance.environment?.name ?? "—"}`,
  ];

  if (instance.description) {
    lines.push(`- **Description**: ${instance.description}`);
  }

  // Technology / platform from descriptor
  if (desc.technology) lines.push(`- **Technology**: ${desc.technology}`);
  if (desc.platform) lines.push(`- **Platform**: ${desc.platform}`);

  // Data contract info
  const dc = instance.dataContract ?? desc.dataContract;
  if (dc) {
    if (dc.policy_id) lines.push(`- **Data contract policy**: ${dc.policy_id}`);
    if (dc.SLA) {
      const sla = dc.SLA;
      const parts = [];
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
  }

  // Sample data
  if (desc.sampleData?.columns?.length) {
    lines.push("", "**Sample Data** (first 3 rows):", "");
    lines.push("| " + desc.sampleData.columns.join(" | ") + " |");
    lines.push("| " + desc.sampleData.columns.map(() => "---").join(" | ") + " |");
    const rows = (desc.sampleData.rows ?? []).slice(0, 3);
    for (const row of rows) {
      lines.push("| " + row.join(" | ") + " |");
    }
  }

  // Parent system info
  const parent = instance.parentComponent?.[0]?.data;
  if (parent) {
    const system = parent.system?.[0]?.data;
    if (system) {
      const domain = system.domain?.[0]?.data?.name;
      lines.push("", `**Parent**: ${system.display_name ?? system.name} (${domain ?? "—"})`);
    }
  }

  return lines.join("\n");
}

function formatOutputPortSummary(comp: any): string {
  const lines = [
    `- **${comp.display_name ?? comp.name}**`,
    `  - ID: ${comp.id} | External: \`${comp.external_id ?? "—"}\``,
    `  - Kind: ${comp.kind ?? "—"} | Type: ${comp.type ?? "—"}`,
    `  - Version: ${comp.version ?? "—"}`,
    `  - Consumable: ${comp.consumable ?? "—"} | Shoppable: ${comp.shoppable ?? "—"}`,
  ];
  if (comp.description) lines.push(`  - ${comp.description}`);
  return lines.join("\n");
}

// ── Tool definitions ────────────────────────────────────────────────────

const marketplaceTools: ToolDefinition[] = [
  {
    name: "marketplace_search",
    description:
      "Search for data products and output ports in the Witboost Marketplace. " +
      "Returns consumable entities matching a text query. " +
      "Use this to discover available data products, output ports, and their metadata.",
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
          description: "Pagination cursor from a previous search result (base64-encoded). Omit for first page.",
        },
      },
      required: ["term"],
    },
    async handler(params, ctx) {
      const term = params.term as string;
      const environment = (params.environment as string) ?? "production";
      const pageLimit = (params.pageLimit as number) ?? 15;
      const pageCursor = params.pageCursor as string | undefined;

      // Decode offset from cursor (base64-encoded number) or default to 0
      let offset = 0;
      if (pageCursor) {
        try {
          offset = parseInt(Buffer.from(pageCursor, "base64").toString("utf8"), 10) || 0;
        } catch { offset = 0; }
      }

      // Build where clause: text search + environment + consumable filter
      const textPattern = `%${term}%`;
      const textFilter = {
        _or: [
          { name: { _ilike: textPattern } },
          { display_name: { _ilike: textPattern } },
          { description: { _ilike: textPattern } },
        ],
      };

      const where: Record<string, unknown> = {
        _and: [
          textFilter,
          { environment: { name: { _eq: environment } } },
          { kind: { _eq: "system" } },
          { type: { _eq: "dataproduct" } },
        ],
      };

      const res = await graphql(ctx, "SearchMarketplace", SEARCH_INSTANCES_QUERY, {
        where,
        limit: pageLimit,
        offset,
      });

      if (!res.ok) return apiError("HASURA_ERROR", res.error);

      const instances = res.data?.instances ?? [];
      const total = res.data?.total?.aggregate?.count ?? instances.length;

      if (instances.length === 0) {
        return text(`No marketplace results found for "${term}" in ${environment}.`);
      }

      const sections = instances.map(formatSearchResult);
      const header = `# Marketplace Search: "${term}" (${instances.length} of ${total} results)\n\n**Environment**: ${environment}`;

      const lines = [header, "", ...sections.join("\n\n---\n\n").split("\n")];

      // Pagination: provide next cursor if there are more results
      const nextOffset = offset + pageLimit;
      if (nextOffset < total) {
        const nextCursor = Buffer.from(String(nextOffset)).toString("base64");
        lines.push("", `---`, `**Next page cursor**: \`${nextCursor}\``);
      }

      return text(lines.join("\n"));
    },
  },

  {
    name: "marketplace_get_data_product",
    description:
      "Get detailed information about a data product from the Witboost Marketplace, " +
      "including its domain, owner, taxonomy, environment, tags, and data contract counts. " +
      "Use the numeric marketplace instance ID (from search results or browsing).",
    category: "marketplace",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "Marketplace instance ID (numeric, e.g. 1, 175)",
        },
      },
      required: ["id"],
    },
    async handler(params, ctx) {
      const id = params.id as number;

      const dcRelationFilter = {
        _and: [
          {
            name: { _eq: "readsFrom" },
            instanceByTargetInstanceId: {
              _or: [
                { data_contract: { id: { _is_null: false } } },
                {
                  relations: {
                    name: { _eq: "partOfComponent" },
                    instanceByTargetInstanceId: {
                      data_contract: { id: { _is_null: false } },
                    },
                  },
                },
              ],
            },
          },
        ],
      };

      const ownedDcsFilter = {
        name: { _eq: "partOfSystem" },
        instance: {
          _or: [
            { data_contract: { id: { _is_null: false } } },
            {
              relationsByTargetInstanceId: {
                name: { _eq: "partOfComponent" },
                instance: { data_contract: { id: { _is_null: false } } },
              },
            },
          ],
        },
      };

      const res = await graphql(ctx, "GetInstanceById", GET_INSTANCE_BY_ID_QUERY, {
        id: String(id),
        consumedDcsWhere: dcRelationFilter,
        ownedDcsWhere: ownedDcsFilter,
      });

      if (!res.ok) return apiError("HASURA_ERROR", res.error);

      const instances = res.data?.instances ?? [];
      if (instances.length === 0) {
        return text(`No data product found with marketplace ID: ${id}`, true);
      }

      return text(formatDataProduct(instances[0]));
    },
  },

  {
    name: "marketplace_get_output_ports",
    description:
      "Get the output ports (consumable interfaces) of a data product in the Witboost Marketplace. " +
      "Returns all components associated with the data product instance, " +
      "including their kind, type, version, consumability status, and descriptions. " +
      "Use the numeric marketplace instance ID of the data product.",
    category: "marketplace",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "Marketplace instance ID of the data product (numeric, e.g. 1, 175)",
        },
      },
      required: ["id"],
    },
    async handler(params, ctx) {
      const id = params.id as number;

      const res = await graphql(ctx, "GetOutputPortsByInstanceId", GET_OUTPUT_PORTS_QUERY, {
        id,
      });

      if (!res.ok) return apiError("HASURA_ERROR", res.error);

      const instances = res.data?.instances ?? [];
      if (instances.length === 0) {
        return text(`No data product found with marketplace ID: ${id}`, true);
      }

      const dp = instances[0];
      const components = (dp.components ?? []).map((c: any) => c.data).filter(Boolean);

      if (components.length === 0) {
        return text(`Data product "${dp.display_name ?? dp.name}" has no output ports.`);
      }

      const header = `# Output Ports — ${dp.display_name ?? dp.name}\n\n**Version**: ${dp.version ?? "—"} | **Components**: ${components.length}`;

      const sections = components.map(formatOutputPortSummary);

      return text([header, "", ...sections].join("\n"));
    },
  },

  {
    name: "marketplace_get_output_port",
    description:
      "Get full details of a specific output port from the Witboost Marketplace, " +
      "including its descriptor, data contract (schema, SLA), sample data, " +
      "parent data product, technology, and tags. " +
      "Use the numeric marketplace instance ID of the output port.",
    category: "marketplace",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "Marketplace instance ID of the output port (numeric, e.g. 180, 183)",
        },
        outputPortTypeField: {
          type: "string",
          description: "Descriptor field name for the output port type (default: 'outputPortType')",
          default: "outputPortType",
        },
      },
      required: ["id"],
    },
    async handler(params, ctx) {
      const id = params.id as number;
      const typeField = (params.outputPortTypeField as string) ?? "outputPortType";

      const res = await graphql(ctx, "getOutputPortById", GET_OUTPUT_PORT_BY_ID_QUERY, {
        id,
        consumableInterfaceTypeField: typeField,
      });

      if (!res.ok) return apiError("HASURA_ERROR", res.error);

      const instances = res.data?.instances ?? [];
      if (instances.length === 0) {
        return text(`No output port found with marketplace ID: ${id}`, true);
      }

      return text(formatOutputPort(instances[0]));
    },
  },
];

registerTools(marketplaceTools);
