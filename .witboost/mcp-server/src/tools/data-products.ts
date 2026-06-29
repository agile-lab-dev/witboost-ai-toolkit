import { registerTools } from "./registry.js";
import { waitForScaffolderTask } from "./scaffolder.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

const dataProductTools: ToolDefinition[] = [
  {
    name: "list_data_products",
    description: "List data products accessible to the authenticated user",
    category: "data-products",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Filter by domain (optional)" },
        status: { type: "string", description: "Filter by status (optional)" },
        limit: { type: "number", description: "Max results (default: 50)" },
        offset: { type: "number", description: "Pagination offset (default: 0)" },
      },
    },
    async handler(params, ctx) {
      const filter = ["kind=system"];
      if (params.domain) filter.push(`metadata.domain=${params.domain}`);

      const res = await ctx.api.get<any[]>("/api/catalog/entities", {
        filter: filter.join(","),
        limit: (params.limit as number) ?? 50,
        offset: (params.offset as number) ?? 0,
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const items = res.data ?? [];
      if (items.length === 0) return text("No data products found.");

      const lines = items.map((dp: any) => {
        const name = dp.metadata?.name ?? "unknown";
        const domain = dp.spec?.domain ?? "—";
        const version = dp.spec?.mesh?.version ?? dp.metadata?.annotations?.["witboost.com/version"] ?? "—";
        return `- **${dp.metadata?.title ?? name}** (${name})\n  Domain: ${domain} | Version: ${version}`;
      });

      return text(`Found ${items.length} data product(s):\n\n${lines.join("\n\n")}`);
    },
  },
  {
    name: "get_data_product",
    description: "Get detailed information about a specific data product",
    category: "data-products",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier (URN or name)" },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const id = params.dataProductId as string;

      const res = await ctx.api.get<any>(`/api/catalog/entities/by-name/system/default/${id}`);
      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const dp = res.data;
      const components = dp.relations
        ?.filter((r: any) => r.type === "hasPart")
        ?.map((r: any) => r.targetRef) ?? [];

      return text(
        [
          `## ${dp.metadata?.title ?? dp.metadata?.name}`,
          `- **ID**: ${dp.metadata?.name}`,
          `- **Domain**: ${dp.spec?.domain ?? "—"}`,
          `- **Owner**: ${dp.spec?.owner ?? "—"}`,
          `- **Version**: ${dp.spec?.mesh?.version ?? "—"}`,
          `- **Description**: ${dp.metadata?.description ?? "—"}`,
          `- **Components** (${components.length}): ${components.join(", ") || "none"}`,
        ].join("\n"),
      );
    },
  },
  {
    name: "create_data_product",
    description:
      "Create a new data product from a template. " +
      "Entity references must NOT include 'default/' namespace (use 'domain:finance', not 'domain:default/finance'). " +
      "For dataproduct-template: identifier must be 'domain.name.version' format (e.g. 'finance.spend-analytics.0'), " +
      "field is 'devGroup' (not developmentGroup), maturity must be 'Proposed', email is REQUIRED. " +
      "For dataproduct-template-skeleton: identifier is short name, field is 'developmentGroup'. " +
      "CRITICAL: dataProductOwner is a RESERVED field — once set at creation it can NEVER be changed. " +
      "Do NOT guess the owner value. If not provided, the tool auto-resolves it from the authenticated user's catalog entity.",
    category: "data-products",
    inputSchema: {
      type: "object",
      properties: {
        blueprintId: { type: "string", description: "Blueprint template name (e.g. dataproduct-template-skeleton)" },
        parameters: {
          type: "object",
          description:
            "Template parameter values. Entity refs must omit 'default/' namespace. " +
            "CRITICAL: Do NOT guess dataProductOwner — omit it to auto-resolve from the authenticated user, " +
            "or provide the EXACT entity ref from the catalog (e.g. 'user:john.doe_example.com').",
        },
      },
      required: ["blueprintId", "parameters"],
    },
    async handler(params, ctx) {
      const blueprintId = params.blueprintId as string;
      const values = params.parameters as Record<string, unknown>;

      // Sanitize entity refs: remove 'default/' from refs like 'domain:default/finance' → 'domain:finance'
      for (const key of Object.keys(values)) {
        const v = values[key];
        if (typeof v === "string" && /^(domain|user|group|system|component|template):default\//.test(v)) {
          values[key] = v.replace(":default/", ":");
        }
      }

      // --- Owner resolution & validation ---
      // dataProductOwner is a RESERVED field: once set at first ingestion it can NEVER be changed.
      // If not provided, resolve from the authenticated user's catalog entity.
      // If provided, validate it exists in the catalog.
      const ownerKey = "dataProductOwner";
      let owner = values[ownerKey] as string | undefined;

      if (!owner) {
        // Auto-resolve: look up the authenticated user via the platform identity API
        const meRes = await ctx.api.get<any>("/api/auth/v1/userinfo");
        if (meRes.ok) {
          // Response has { claims: { sub: "user:default/name" } } — strip "default/"
          const claims = meRes.data?.claims ?? meRes.data;
          const userRef = (claims?.sub ?? meRes.data?.userEntityRef ?? "") as string;
          owner = userRef.replace(":default/", ":");
        }
        if (!owner) {
          return text(
            "[OWNER_REQUIRED] Could not auto-resolve dataProductOwner. " +
            "Provide the exact user entity ref from the catalog (e.g. 'user:john.doe_example.com').",
            true,
          );
        }
        values[ownerKey] = owner;
      }

      // Validate the owner exists in the catalog
      const ownerName = owner.replace(/^user:/, "");
      const ownerCheck = await ctx.api.get<any>(`/api/catalog/entities/by-name/user/default/${ownerName}`);
      if (!ownerCheck.ok) {
        // Try listing users that match partially
        const usersRes = await ctx.api.get<any[]>("/api/catalog/entities", {
          filter: `kind=user,metadata.name=${ownerName}`,
          limit: 5,
        });
        const suggestions = (usersRes.data ?? []).map((u: any) => `user:${u.metadata?.name}`).join(", ");

        return text(
          `[INVALID_OWNER] User '${owner}' not found in the catalog. ` +
          `This field is IMMUTABLE after creation — using a wrong value will permanently break the data product.\n` +
          (suggestions ? `Did you mean: ${suggestions}` : "List users with: list_data_products or check the Witboost UI."),
          true,
        );
      }

      // Also auto-set email from the user entity if not provided
      if (!values.email) {
        const userEntity = ownerCheck.data;
        const email = userEntity?.spec?.profile?.email ?? userEntity?.metadata?.annotations?.["microsoft.com/email"];
        if (email) values.email = email;
      }

      const res = await ctx.api.post<any>("/api/scaffolder/v2/tasks", {
        templateRef: `template:default/${blueprintId}`,
        values,
      });

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const taskId = res.data?.id;
      const result = await waitForScaffolderTask(ctx.api, taskId);

      if (!result.ok) {
        return text(
          `[SCAFFOLDER_FAILED] Data product creation failed.\n- **Task ID**: ${taskId}\n- **Error**: ${result.error}`,
          true,
        );
      }

      // Derive the entity ID from the parameters
      // Some templates use a fully qualified identifier (domain.name.version),
      // others use just the name part. Detect by checking for dots.
      const identifier = (values.identifier as string) ?? "";
      const domain = (values.domain as string)?.replace(/^domain:/, "") ?? "";
      const entityId = identifier.includes(".")
        ? identifier
        : `${domain}.${identifier}.0`;

      return text(
        `Data product created successfully.\n- **Entity ID**: ${entityId}\n- **Task ID**: ${taskId}`,
      );
    },
  },
  {
    name: "update_data_product",
    description:
      "Update a data product's metadata by editing its repository files. " +
      "Witboost entities are Git-managed — they CANNOT be updated via the catalog API. " +
      "This tool guides you to the correct repo and file to edit. " +
      "For %SKELETON entities, edit parameters.yaml. For plain entities, edit catalog-info.yaml directly.",
    category: "data-products",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
        updates: { type: "object", description: "Fields to update (for reference only — actual edit must be done in repo files)" },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const id = params.dataProductId as string;

      // Get the entity to find its source repo
      const dpRes = await ctx.api.get<any>(`/api/catalog/entities/by-name/system/default/${id}`);
      if (!dpRes.ok) return apiError(dpRes.error!.code, dpRes.error!.message);

      const slug = dpRes.data.metadata?.annotations?.["gitlab.com/project-slug"];
      const srcLoc = dpRes.data.metadata?.annotations?.["backstage.io/source-location"] ?? "";
      let cloneUrl: string | undefined;

      if (slug && !slug.includes("undefined") && !slug.includes("${{")) {
        cloneUrl = `https://gitlab.com/${slug}.git`;
      } else {
        const match = srcLoc.replace(/^url:/, "").match(/https:\/\/gitlab\.com\/([^/]+(?:\/[^/]+)*?)(?:\/-\/|$)/);
        if (match) cloneUrl = `https://gitlab.com/${match[1]}.git`;
      }

      const updates = params.updates as Record<string, unknown> | undefined;
      const fieldsInfo = updates ? `\nFields to update: ${Object.keys(updates).join(", ")}` : "";

      return text(
        `**Data product \`${id}\` is Git-managed and cannot be updated via API.**\n\n` +
        `To update it:\n` +
        `1. Clone the repo: ${cloneUrl ?? "Use \\`list_repositories\\` to find the URL"}\n` +
        `2. Check if \`catalog-info.yaml\` starts with \`%SKELETON\`\n` +
        `3. If skeleton → edit \`parameters.yaml\` (add fields under \`parameters:\` AND \`values:\`)\n` +
        `4. If plain YAML → edit \`catalog-info.yaml\` directly\n` +
        `5. Git commit and push${fieldsInfo}`,
      );
    },
  },
  {
    name: "delete_data_product",
    description: "Delete a data product. Requires confirmation via confirm parameter.",
    category: "data-products",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
        confirm: { type: "boolean", description: "Must be true to confirm deletion" },
      },
      required: ["dataProductId", "confirm"],
    },
    async handler(params, ctx) {
      if (params.confirm !== true) {
        return text("[CONFIRMATION_REQUIRED] Set confirm: true to delete this data product.", true);
      }

      const id = params.dataProductId as string;
      const res = await ctx.api.delete<any>(`/api/catalog/entities/by-name/system/default/${id}`);
      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      return text(`Data product **${id}** has been deleted.`);
    },
  },
];

registerTools(dataProductTools);
