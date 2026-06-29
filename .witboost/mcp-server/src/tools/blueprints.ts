import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolContext, ToolResult } from "./types.js";

/** Helper to return a text tool result */
function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

/** Helper to format an API error into a ToolResult */
function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

/** Topologically sort templates based on their dependency graph */
function topoSortTemplates(
  mainTemplateId: string,
  templates: { id: string; dependencies: string[] }[],
): { id: string; dependencies: string[] }[] {
  // Build the full list: main template + component templates
  const all = [
    { id: mainTemplateId, dependencies: [] as string[] },
    ...templates,
  ];

  const graph = new Map<string, string[]>();
  for (const t of all) graph.set(t.id, t.dependencies ?? []);

  const visited = new Set<string>();
  const result: string[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    for (const dep of graph.get(id) ?? []) visit(dep);
    result.push(id);
  }

  for (const t of all) visit(t.id);

  // Return in dependency order, preserving original template objects
  const orderMap = new Map(result.map((id, i) => [id, i]));
  return all
    .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
}

const blueprintTools: ToolDefinition[] = [
  {
    name: "list_blueprints",
    description:
      "List available blueprints (kind=Blueprint) from the Witboost catalog. " +
      "Blueprints define which templates compose a data product and in what order they must be created.",
    category: "blueprints",
    inputSchema: {
      type: "object",
      properties: {},
    },
    async handler(_params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const res = await ctx.api.get<any[]>("/api/catalog/entities", {
        filter: "kind=Blueprint",
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const items = res.data ?? [];
      if (items.length === 0) {
        return text("No blueprints found in the catalog.");
      }

      const lines = items.map((bp: any) => {
        const name = bp.metadata?.name ?? "unknown";
        const title = bp.metadata?.title ?? name;
        const desc = bp.metadata?.description ?? "";
        const mainTemplate = bp.spec?.mainTemplateId ?? "—";
        const templateCount = bp.spec?.templates?.length ?? 0;
        return `- **${title}** (\`${name}\`)\n  ${desc}\n  Main template: \`${mainTemplate}\` | Component templates: ${templateCount}`;
      });

      return text(`Found ${items.length} blueprint(s):\n\n${lines.join("\n\n")}`);
    },
  },
  {
    name: "get_blueprint",
    description:
      "Get full details of a specific blueprint by name, including the ordered list of " +
      "templates (with dependencies) that define the component creation sequence. " +
      "Use this to understand which components a data product needs and in what order to create them.",
    category: "blueprints",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Blueprint entity name (e.g., 'DPblueprint', 'EnterpriseDP')",
        },
      },
      required: ["name"],
    },
    async handler(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const name = params.name as string;

      const res = await ctx.api.get<any>(
        `/api/catalog/entities/by-name/Blueprint/default/${name}`,
      );

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const bp = res.data;
      const title = bp.metadata?.title ?? name;
      const desc = bp.metadata?.description ?? "";
      const mainTemplateId: string = bp.spec?.mainTemplateId ?? "";
      const templates: { id: string; dependencies: string[] }[] = bp.spec?.templates ?? [];

      // Compute creation order via topological sort
      const ordered = topoSortTemplates(mainTemplateId, templates);

      const steps = ordered.map((t, i) => {
        const deps = t.dependencies.length > 0
          ? ` (depends on: ${t.dependencies.map((d) => `\`${d}\``).join(", ")})`
          : " (no dependencies)";
        return `${i + 1}. \`${t.id}\`${deps}`;
      });

      return text(
        `## Blueprint: ${title}\n\n` +
        `${desc}\n\n` +
        `**Main template**: \`${mainTemplateId}\`\n\n` +
        `### Component creation order\n\n` +
        `${steps.join("\n")}`,
      );
    },
  },
  {
    name: "list_templates",
    description:
      "List available scaffolder templates (kind=Template) from the Witboost catalog. " +
      "Returns the exact template ID to use with get_template_schema and create_data_product/add_component. " +
      "IMPORTANT: template IDs are platform-specific and must not be guessed — always use the exact ID returned by this tool.",
    category: "blueprints",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Filter by domain (optional)" },
        type: { type: "string", description: "Filter by blueprint type (optional)" },
      },
    },
    async handler(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const domain = params.domain as string | undefined;
      const type = params.type as string | undefined;

      // Witboost catalog API — filter by kind=Template
      const filter = ["kind=template"];
      if (domain) filter.push(`metadata.domain=${domain}`);
      if (type) filter.push(`spec.type=${type}`);

      const res = await ctx.api.get<unknown[]>("/api/catalog/entities", {
        filter: filter.join(","),
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const items = res.data ?? [];
      if (items.length === 0) {
        return text("No templates found matching the specified filters.");
      }

      const lines = items.map((item: any) => {
        const name = item.metadata?.name ?? "unknown";
        const title = item.metadata?.title ?? name;
        const desc = item.metadata?.description ?? "";
        const generates = item.spec?.generates ?? "";
        const typeInfo = generates ? ` [${generates}]` : "";
        return `- **${title}**${typeInfo}\n  Template ID: \`${name}\` ← use this exact value for get_template_schema\n  ${desc}`;
      });

      return text(
        `Found ${items.length} template(s):\n\n${lines.join("\n\n")}\n\n` +
        `> **Note**: Use the exact \`Template ID\` value above when calling \`get_template_schema\` or other template tools.`,
      );
    },
  },
  {
    name: "get_template_schema",
    description:
      "Retrieve the JSON Schema for a scaffolder template's parameters. " +
      "The templateId MUST be the exact name returned by list_templates (e.g. 'dataproduct-template', 'snowflake-template.1'). " +
      "Do NOT guess or invent template names — always call list_templates first.",
    category: "blueprints",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string", description: "Template name (e.g., 'dataproduct-template', 'snowflake-template.1')" },
      },
      required: ["templateId"],
    },
    async handler(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const templateId = params.templateId as string;

      const res = await ctx.api.get<any>(
        `/api/catalog/entities/by-name/template/default/${templateId}`,
      );

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const parameters = res.data?.spec?.parameters ?? [];

      return {
        content: [
          {
            type: "text",
            text: `Template **${res.data?.metadata?.title ?? templateId}** schema:\n\n\`\`\`json\n${JSON.stringify(parameters, null, 2)}\n\`\`\``,
          },
        ],
      };
    },
  },
  {
    name: "get_template_parameters",
    description: "Get default parameter values for a scaffolder template",
    category: "blueprints",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string", description: "Template name (e.g., 'dataproduct-template', 'snowflake-template.1')" },
      },
      required: ["templateId"],
    },
    async handler(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const templateId = params.templateId as string;

      const res = await ctx.api.get<any>(
        `/api/catalog/entities/by-name/template/default/${templateId}`,
      );

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const parameters = res.data?.spec?.parameters ?? [];
      const defaults: Record<string, unknown> = {};

      for (const step of parameters) {
        if (step.properties) {
          for (const [key, prop] of Object.entries<any>(step.properties)) {
            if (prop.default !== undefined) {
              defaults[key] = prop.default;
            }
          }
        }
      }

      return text(
        `Default parameters for **${res.data?.metadata?.title ?? templateId}**:\n\n\`\`\`json\n${JSON.stringify(defaults, null, 2)}\n\`\`\``,
      );
    },
  },
  {
    name: "validate_against_template",
    description:
      "Validate a data product descriptor against its component templates' schemas. " +
      "Reads each component's useCaseTemplateId, fetches the corresponding edit-template schema, " +
      "and checks current descriptor values against the template's validation rules " +
      "(regex patterns, required fields, enums, min/max). " +
      "Use BEFORE deploying to catch naming convention violations and missing required fields early.",
    category: "blueprints",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product in dot-notation (e.g. 'finance.spend-analytics.0')",
        },
        environment: {
          type: "string",
          description: "Target environment (e.g. 'production', 'development'). If omitted, uses WITBOOST_DEFAULT_ENVIRONMENT.",
        },
      },
      required: ["dataProductId"],
    },
    async handler(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const dpId = params.dataProductId as string;
      const environment = (params.environment as string) || ctx.config.defaultEnvironment;

      if (!environment) {
        return text(
          "[ENVIRONMENT_REQUIRED] Parameter 'environment' is mandatory. " +
          "Provide it explicitly or set WITBOOST_DEFAULT_ENVIRONMENT in .env.",
          true,
        );
      }

      // 1. Fetch the full descriptor via preview API
      const previewRes = await ctx.api.post<any>(
        `/api/builder/dataproducts/preview`,
        {},
        {
          dataProduct: dpId,
          projectKind: "System",
          environment,
          version: "0.0.0",
          bypassCache: true,
        },
      );
      if (!previewRes.ok) return apiError(previewRes.error!.code, previewRes.error!.message);

      const descriptor = previewRes.data;
      const components: any[] = descriptor?.components ?? [];

      if (components.length === 0) {
        return text("No components found in the data product descriptor.");
      }

      const sections: string[] = [`# Template Validation for \`${dpId}\`\n`];

      for (const comp of components) {
        const compName = comp.name ?? comp.id ?? "unknown";
        const templateUrn: string | undefined = comp.useCaseTemplateId;

        if (!templateUrn) {
          sections.push(`## ${compName}\n\n⚠️ No \`useCaseTemplateId\` found — skipping template validation.\n`);
          continue;
        }

        // Extract template name from URN: urn:dmb:utm:snowflake-outputport-template:0.0.0 → snowflake-outputport-template
        const urnParts = templateUrn.split(":");
        const templateName = urnParts.length >= 4 ? urnParts[3] : templateUrn;

        // Fetch the edit-template schema (convention: template name + ".edit")
        // Try edit variant first, fall back to base template
        let templateEntity: any = null;
        let usedTemplateName = `${templateName}.edit`;

        const editRes = await ctx.api.get<any>(
          `/api/catalog/entities/by-name/template/default/${usedTemplateName}`,
        );

        if (editRes.ok) {
          templateEntity = editRes.data;
        } else {
          // Fall back to base template
          usedTemplateName = templateName;
          const baseRes = await ctx.api.get<any>(
            `/api/catalog/entities/by-name/template/default/${usedTemplateName}`,
          );
          if (baseRes.ok) {
            templateEntity = baseRes.data;
          }
        }

        if (!templateEntity) {
          sections.push(
            `## ${compName}\n\n` +
            `Template: \`${templateUrn}\`\n` +
            `⚠️ Could not fetch template \`${templateName}\` or \`${templateName}.edit\` from catalog.\n`,
          );
          continue;
        }

        const steps: any[] = templateEntity.spec?.parameters ?? [];
        const violations: string[] = [];
        const rules: string[] = [];

        for (const step of steps) {
          const stepTitle = step.title ?? "Untitled step";
          const props = step.properties ?? {};
          const required: string[] = step.required ?? [];

          for (const [fieldName, schema] of Object.entries<any>(props)) {
            // Resolve the current value from the component descriptor
            const currentValue = resolveFieldValue(comp, fieldName);

            // Collect validation rules
            const fieldRules: string[] = [];

            if (schema.pattern) {
              fieldRules.push(`pattern: \`${schema.pattern}\``);
              if (currentValue !== undefined && typeof currentValue === "string") {
                const re = new RegExp(schema.pattern);
                if (!re.test(currentValue)) {
                  violations.push(
                    `❌ **${fieldName}**: value \`${truncate(currentValue)}\` does not match pattern \`${schema.pattern}\``,
                  );
                }
              }
            }

            if (schema.enum) {
              fieldRules.push(`enum: ${schema.enum.map((v: any) => `\`${v}\``).join(", ")}`);
              if (currentValue !== undefined && !schema.enum.includes(currentValue)) {
                violations.push(
                  `❌ **${fieldName}**: value \`${truncate(String(currentValue))}\` not in allowed values [${schema.enum.join(", ")}]`,
                );
              }
            }

            if (schema.minLength !== undefined) fieldRules.push(`minLength: ${schema.minLength}`);
            if (schema.maxLength !== undefined) fieldRules.push(`maxLength: ${schema.maxLength}`);

            if (typeof currentValue === "string") {
              if (schema.minLength !== undefined && currentValue.length < schema.minLength) {
                violations.push(`❌ **${fieldName}**: length ${currentValue.length} < minLength ${schema.minLength}`);
              }
              if (schema.maxLength !== undefined && currentValue.length > schema.maxLength) {
                violations.push(`❌ **${fieldName}**: length ${currentValue.length} > maxLength ${schema.maxLength}`);
              }
            }

            if (required.includes(fieldName)) {
              fieldRules.push("**required**");
              if (currentValue === undefined || currentValue === null || currentValue === "") {
                violations.push(`❌ **${fieldName}**: required field is missing or empty`);
              }
            }

            if (fieldRules.length > 0) {
              const valueStr = currentValue !== undefined ? ` = \`${truncate(String(currentValue))}\`` : "";
              rules.push(`- **${fieldName}**${valueStr}: ${fieldRules.join(" | ")}`);
            }
          }
        }

        const header =
          `## ${compName}\n\n` +
          `Template: \`${usedTemplateName}\` (from \`${templateUrn}\`)\n`;

        if (violations.length > 0) {
          sections.push(
            header +
            `\n### ❌ Violations (${violations.length})\n\n${violations.join("\n")}\n` +
            `\n### Validation Rules\n\n${rules.join("\n")}`,
          );
        } else {
          sections.push(
            header +
            `\n### ✅ No violations detected\n` +
            `\n### Validation Rules\n\n${rules.join("\n")}`,
          );
        }
      }

      return text(sections.join("\n\n---\n\n"));
    },
  },
];

/**
 * Resolve a template field name to its value in the component descriptor.
 * Template fields map to descriptor fields with common conventions:
 * - Direct field in component root (e.g., name, description)
 * - Field in spec.mesh (e.g., technology, platform)
 * - Nested via dot notation
 */
function resolveFieldValue(comp: any, fieldName: string): unknown {
  // Direct match on component root
  if (comp[fieldName] !== undefined) return comp[fieldName];

  // Common template fields map to spec.mesh.*
  if (comp.specific?.[fieldName] !== undefined) return comp.specific[fieldName];

  // Check in data contract
  if (comp.dataContract?.[fieldName] !== undefined) return comp.dataContract[fieldName];

  // Check top-level mesh fields
  const meshFields = ["name", "fullyQualifiedName", "description", "kind", "version",
    "technology", "platform", "outputPortType", "creationDate", "startDate"];
  if (meshFields.includes(fieldName) && comp[fieldName] !== undefined) return comp[fieldName];

  return undefined;
}

function truncate(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

registerTools(blueprintTools);
