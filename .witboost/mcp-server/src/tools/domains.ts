import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

const DOMAIN_FIELDS =
  "metadata.name,metadata.title,spec.mesh.name,metadata.namespace,spec.owner,spec.mesh,spec.subDomainOf";
const DEFAULT_LIMIT = 100;

const domainTools: ToolDefinition[] = [
  {
    name: "list_domains",
    description:
      "List the domains available in the Witboost Catalog, including their catalog name, display name, " +
      "namespace, parent domain (spec.subDomainOf, if any), and ready-to-use entity refs " +
      "(domain:<name> and domain:<namespace>/<name>) for templates and scaffolder parameters. " +
      "Use this before creating a data product when you need the exact domain reference to pass to templates.",
    category: "domains",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional client-side filter on domain name/title (case-insensitive)" },
        search: { type: "string", description: "Alias for query" },
        limit: { type: "number", description: "Max results to return (default: 100)" },
      },
    },
    async handler(params, ctx) {
      const res = await ctx.api.get<any[]>("/api/catalog/entities", {
        filter: "kind=domain",
        fields: DOMAIN_FIELDS,
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      let items = res.data ?? [];

      const search = ((params.query as string) ?? (params.search as string) ?? "").trim().toLowerCase();
      if (search) {
        items = items.filter((d: any) => {
          const name = (d.metadata?.name ?? "").toLowerCase();
          const title = (d.metadata?.title ?? "").toLowerCase();
          const meshName = (d.spec?.mesh?.name ?? "").toLowerCase();
          return name.includes(search) || title.includes(search) || meshName.includes(search);
        });
      }

      if (items.length === 0) return text("No domains found.");

      const limit = (params.limit as number) ?? DEFAULT_LIMIT;
      items = items.slice(0, limit);

      const lines = items.map((d: any) => {
        const name = d.metadata?.name ?? "unknown";
        const namespace = d.metadata?.namespace ?? "default";
        const displayName = d.metadata?.title ?? d.spec?.mesh?.name ?? name;
        const subDomainOf = (d.spec?.subDomainOf as string | undefined)?.replace(":default/", ":");
        const parentLine = subDomainOf ? `\n  Parent domain: \`${subDomainOf}\`` : "";
        return (
          `- **${displayName}** (${name})\n` +
          `  Namespace: ${namespace}\n` +
          `  Ref: \`domain:${name}\` | Full ref: \`domain:${namespace}/${name}\`${parentLine}`
        );
      });

      return text(`Found ${items.length} domain(s):\n\n${lines.join("\n\n")}`);
    },
  },
];

registerTools(domainTools);
