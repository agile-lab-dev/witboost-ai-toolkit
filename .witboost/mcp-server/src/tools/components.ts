import { registerTools } from "./registry.js";
import { waitForScaffolderTask } from "./scaffolder.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

const componentTools: ToolDefinition[] = [
  {
    name: "list_components",
    description: "List components of a data product",
    category: "components",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Parent data product identifier" },
        type: { type: "string", description: "Filter by component type (optional)" },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;
      const typeFilter = params.type as string | undefined;

      // Get the data product to find its component relations
      const dpRes = await ctx.api.get<any>(`/api/catalog/entities/by-name/system/default/${dpId}`);
      if (!dpRes.ok) return apiError(dpRes.error!.code, dpRes.error!.message);

      const componentRefs = dpRes.data.relations
        ?.filter((r: any) => r.type === "hasPart")
        ?.map((r: any) => r.targetRef) ?? [];

      if (componentRefs.length === 0) return text("No components found for this data product.");

      // Fetch component details
      const components: any[] = [];
      for (const ref of componentRefs) {
        // ref format: "component:default/name"
        const res = await ctx.api.get<any>(`/api/catalog/entities/by-name/${ref.replace(":", "/")}`);
        if (res.ok) components.push(res.data);
      }

      const filtered = typeFilter
        ? components.filter((c) => c.spec?.type === typeFilter)
        : components;

      if (filtered.length === 0) return text("No components match the specified filter.");

      const lines = filtered.map((c: any) => {
        const name = c.metadata?.name ?? "unknown";
        const type = c.spec?.type ?? "—";
        const tech = c.spec?.mesh?.technology ?? "—";
        return `- **${c.metadata?.title ?? name}** (${name})\n  Type: ${type} | Technology: ${tech}`;
      });

      return text(`Components (${filtered.length}):\n\n${lines.join("\n\n")}`);
    },
  },
  {
    name: "add_component",
    description:
      "Add a new component to a data product using a scaffolder template. " +
      "MANDATORY WORKFLOW: call get_blueprint → get_template_schema → add_component. " +
      "The blueprintId MUST be an exact template name from get_blueprint or list_templates " +
      "(e.g. 'snowflake-template.1', 'dbt-template.1', 'aws-dremio-template.1'). " +
      "NEVER invent or guess template IDs — the call will fail with a clear error if the ID is wrong. " +
      "The component identifier will be auto-qualified to 'domain.dp.version.component-name' format. " +
      "Fields domainName and dataproductName are auto-derived if not provided. " +
      "IMPORTANT: Column descriptions must NOT contain colons (:) — they break YAML template rendering.",
    category: "components",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Parent data product identifier in dot-notation (e.g. 'finance.spend-analytics.0')",
        },
        blueprintId: {
          type: "string",
          description:
            "Exact template name from list_templates or get_blueprint " +
            "(e.g. 'snowflake-template.1', 'dbt-template.1'). " +
            "NEVER guess — always call list_templates or get_blueprint first.",
        },
        parameters: {
          type: "object",
          description:
            "Component template parameters from get_template_schema. " +
            "The 'identifier' field should be the short component name " +
            "(e.g. 'payment-scoring') — it will be auto-qualified to the full format. " +
            "repoUrl must be: gitlab.com?owner=<encoded-group>&repo=<RepoName>",
        },
      },
      required: ["dataProductId", "blueprintId", "parameters"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;
      const blueprintId = params.blueprintId as string;
      const values = params.parameters as Record<string, unknown>;

      // Pre-validate: check that blueprintId is a real template before calling the scaffolder
      const templateCheck = await ctx.api.get<any>(
        `/api/catalog/entities/by-name/template/default/${blueprintId}`,
      );
      if (!templateCheck.ok) {
        const allTemplates = await ctx.api.get<any[]>("/api/catalog/entities", {
          filter: "kind=template",
        });
        const names = (allTemplates.data ?? [])
          .map((t: any) => `\`${t.metadata?.name}\``)
          .slice(0, 25)
          .join(", ");
        return text(
          `[INVALID_TEMPLATE] Template \`${blueprintId}\` does not exist.\n` +
          `Call \`list_templates\` or \`get_blueprint\` to find valid template IDs.\n\n` +
          `Available templates: ${names}`,
          true,
        );
      }

      // Sanitize entity refs: remove 'default/' from refs like 'domain:default/finance' → 'domain:finance'
      for (const key of Object.keys(values)) {
        const v = values[key];
        if (typeof v === "string" && /^(domain|user|group|system|component|template):default\//.test(v)) {
          values[key] = v.replace(":default/", ":");
        }
      }

      // Auto-qualify component identifier: "payment-scoring" → "finance.spend-analytics.0.payment-scoring"
      const shortId = values.identifier as string | undefined;
      if (shortId && !shortId.includes(".")) {
        values.identifier = `${dpId}.${shortId}`;
      }

      // Auto-derive domainName and dataproductName from dpId if not provided
      const dpParts = dpId.split(".");
      if (!values.domainName && dpParts.length >= 1) {
        values.domainName = dpParts[0].charAt(0).toUpperCase() + dpParts[0].slice(1);
      }

      // Fetch parent DP to inherit owner and derive dataproductName
      const dpRes = await ctx.api.get<any>(`/api/catalog/entities/by-name/system/default/${dpId}`);
      if (dpRes.ok) {
        const dpData = dpRes.data;
        if (!values.dataproductName) {
          values.dataproductName = dpData?.metadata?.title ?? dpData?.spec?.mesh?.name ?? values.name;
        }
        // Inherit dataProductOwner from parent DP to ensure consistency
        if (!values.dataProductOwner) {
          const dpOwner = dpData?.spec?.mesh?.dataProductOwner ?? dpData?.spec?.owner;
          if (dpOwner) {
            values.dataProductOwner = dpOwner.replace(":default/", ":");
          }
        }
        // Inherit developmentGroup from parent DP's spec.owner (the dev group)
        if (!values.developmentGroup) {
          const devGroup = dpData?.spec?.owner;
          if (devGroup) {
            values.developmentGroup = devGroup.replace(":default/", ":");
          }
        }

        // Auto-derive or fix repoUrl from the parent DP's GitLab project-slug.
        // The DP slug looks like "Group/Sub/Path/dpRepoName" — strip the last segment
        // to get the GitLab group that contains all component repos for this DP.
        const dpSlug = dpData?.metadata?.annotations?.["gitlab.com/project-slug"];
        if (dpSlug && typeof dpSlug === "string" && !dpSlug.includes("undefined")) {
          const slugParts = dpSlug.split("/");
          const groupPath = slugParts.slice(0, -1).join("/"); // everything except repo name
          const encodedGroup = encodeURIComponent(groupPath);

          if (!values.repoUrl) {
            // No repoUrl provided — derive from identifier or name
            const repoName = ((values.identifier as string) ?? (values.name as string) ?? "component")
              .split(".").pop()!                   // take short name from qualified id
              .replace(/[^a-zA-Z0-9]/g, "")        // remove hyphens/underscores for GitLab
              .toLowerCase();
            values.repoUrl = `gitlab.com?owner=${encodedGroup}&repo=${repoName}`;
          } else {
            // repoUrl provided — fix the owner if it doesn't match the DP's group
            const currentOwner = (values.repoUrl as string).match(/owner=([^&]+)/)?.[1];
            if (currentOwner && decodeURIComponent(currentOwner) !== groupPath) {
              const repoName = (values.repoUrl as string).match(/repo=([^&]+)/)?.[1] ?? "component";
              values.repoUrl = `gitlab.com?owner=${encodedGroup}&repo=${repoName}`;
            }
          }
        }
      } else if (!values.dataproductName && values.name) {
        values.dataproductName = values.name;
      }

      // Ensure rootDirectory is set to prevent double-slash in catalog-info.yaml URL.
      // Templates like snowflake-template.1 default to "." but the scaffolder doesn't
      // apply the default, producing paths like "master//catalog-info.yaml" → 400 Bad Request.
      if (!values.rootDirectory) {
        values.rootDirectory = ".";
      }

      // Pre-flight check: detect stale repos from previous failed scaffolding attempts
      const repoUrl = values.repoUrl as string | undefined;
      if (repoUrl) {
        const repoMatch = repoUrl.match(/repo=([^&]+)/);
        const repoName = repoMatch?.[1];
        if (repoName) {
          const repoCheck = await ctx.api.get<any[]>("/api/catalog/entities", {
            filter: `kind=component,metadata.annotations.gitlab.com/project-slug~=${repoName}`,
          });
          if (repoCheck.ok && repoCheck.data && repoCheck.data.length > 0) {
            return text(
              `[REPO_EXISTS] A component with repo name '${repoName}' already exists in the catalog ` +
              `(possibly from a previous failed scaffolding attempt).\n` +
              `Either delete the stale GitLab repo and catalog entry, or use a different repo name.\n` +
              `Existing entity: \`${repoCheck.data[0].metadata?.name}\``,
              true,
            );
          }
        }
      }

      const res = await ctx.api.post<any>("/api/scaffolder/v2/tasks", {
        templateRef: `template:default/${blueprintId}`,
        values: { ...values, dataproduct: values.dataproduct ?? `system:${dpId}` },
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const taskId = res.data?.id;
      const result = await waitForScaffolderTask(ctx.api, taskId);

      if (!result.ok) {
        const isRepoNotEmpty = result.error?.includes("is not empty") || result.error?.includes("not empty");
        const guidance = isRepoNotEmpty
          ? `\n\n**The target GitLab repo already has content** (likely from a previous failed attempt).\n` +
            `Options:\n` +
            `1. Delete the stale GitLab repo via the platform UI, then retry\n` +
            `2. Use \`list_components\` to check if this component already exists — if so, just clone it instead\n` +
            `3. Choose a different repo name`
          : "";
        return text(
          `[SCAFFOLDER_FAILED] Component creation failed.\n- **Blueprint**: ${blueprintId}\n- **Task ID**: ${taskId}\n- **Error**: ${result.error}${guidance}`,
          true,
        );
      }

      return text(
        `Component created successfully from blueprint **${blueprintId}** on data product **${dpId}**.\n- **Task ID**: ${taskId}`,
      );
    },
  },
  {
    name: "remove_component",
    description: "Remove a component from a data product",
    category: "components",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Parent data product identifier" },
        componentId: { type: "string", description: "Component identifier" },
        confirm: { type: "boolean", description: "Must be true to confirm removal" },
      },
      required: ["dataProductId", "componentId", "confirm"],
    },
    async handler(params, ctx) {
      if (params.confirm !== true) {
        return text("[CONFIRMATION_REQUIRED] Set confirm: true to remove this component.", true);
      }

      const dpId = params.dataProductId as string;
      const rawId = params.componentId as string;

      // Normalize componentId to catalog entity name:
      // - URN "urn:dmb:cmp:domain:dp:ver:name" → "domain.dp.ver.name"
      // - Short name "my-port" → "domain.dp.ver.my-port" (qualified with dpId)
      // - Already qualified "domain.dp.ver.name" → used as-is
      let compId = rawId;
      if (rawId.startsWith("urn:dmb:cmp:")) {
        compId = rawId.replace("urn:dmb:cmp:", "").replace(/:/g, ".");
      } else if (!rawId.includes(".")) {
        // Short name — qualify with dpId
        compId = `${dpId}.${rawId}`;
      }

      // Try direct deletion first
      const res = await ctx.api.delete<any>(
        `/api/catalog/entities/by-name/component/default/${compId}`,
      );
      if (res.ok) {
        return text(`Component **${compId}** removed from data product **${dpId}**.`);
      }

      // If not found, search the DP's relations to find the correct entity name
      const dpRes = await ctx.api.get<any>(`/api/catalog/entities/by-name/system/default/${dpId}`);
      if (dpRes.ok) {
        const componentRefs = dpRes.data.relations
          ?.filter((r: any) => r.type === "hasPart")
          ?.map((r: any) => r.targetRef) ?? [];

        // Try matching by suffix (short name)
        const shortName = rawId.includes(".") ? rawId.split(".").pop()! : rawId.replace(/^urn:dmb:cmp:.*:/, "");
        const match = componentRefs.find((ref: string) => ref.endsWith(`/${compId}`) || ref.endsWith(`/${dpId}.${shortName}`));
        if (match) {
          const entityName = match.replace("component:default/", "");
          const retryRes = await ctx.api.delete<any>(
            `/api/catalog/entities/by-name/component/default/${entityName}`,
          );
          if (retryRes.ok) {
            return text(`Component **${entityName}** removed from data product **${dpId}**.`);
          }
          return apiError(retryRes.error!.code, retryRes.error!.message);
        }

        return text(
          `[NOT_FOUND] Component not found. Available components for ${dpId}:\n` +
          componentRefs.map((r: string) => `- ${r}`).join("\n"),
          true,
        );
      }

      return apiError(res.error!.code, res.error!.message);
    },
  },
];

registerTools(componentTools);
