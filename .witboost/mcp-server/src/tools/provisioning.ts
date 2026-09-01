import { registerTools } from "./registry.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

/** Rich error that includes coordinator problems/solutions array from the response body */
function richDeployError(res: { error?: any; data?: any; status?: number }, fallbackMsg?: string): ToolResult {
  const code = res.error?.code ?? "DEPLOY_ERROR";
  const userMsg = res.error?.message ?? fallbackMsg ?? "Deploy failed";
  // The raw response body (res.data) may contain problems[] and solutions[] from coordinator
  const body: any = res.data ?? {};
  const problems: string[] = Array.isArray(body.problems) ? body.problems : [];
  const solutions: string[] = Array.isArray(body.solutions) ? body.solutions : [];

  const lines = [`[${code}] ${userMsg}`];
  if (problems.length) {
    lines.push("", "**Problems:**");
    problems.forEach((p: string) => lines.push(`- ${p}`));
  }
  if (solutions.length) {
    lines.push("", "**Solutions:**");
    solutions.forEach((s: string) => lines.push(`- ${s}`));
  }
  if (!problems.length && !solutions.length && body && typeof body === "object") {
    // Dump raw body for debugging
    lines.push("", "**Raw coordinator response:**");
    lines.push("```json");
    lines.push(JSON.stringify(body, null, 2));
    lines.push("```");
  }
  return text(lines.join("\n"), true);
}

/** Convert dot-notation DP id (domain.name.version) to Witboost URN */
function toUrn(dpId: string): string {
  if (dpId.startsWith("urn:")) return dpId;
  const parts = dpId.split(".");
  if (parts.length >= 3) {
    const version = parts[parts.length - 1];
    const name = parts[parts.length - 2];
    const domain = parts.slice(0, -2).join(".");
    return `urn:dmb:dp:${domain}:${name}:${version}`;
  }
  return dpId;
}

/** Format a Release entity from the catalog into a readable summary */
function formatRelease(r: any): string {
  const meta = r.metadata ?? {};
  const icon = meta.isSnapshot ? "📦" : "✅";
  return [
    `${icon} \`${meta.name}\``,
    `   Type: ${meta.isSnapshot ? "SNAPSHOT" : "RELEASE"} | Version: ${meta.version ?? "—"}`,
  ].join("\n");
}

const provisioningTools: ToolDefinition[] = [
  {
    name: "create_snapshot",
    description:
      "Create a new draft release (snapshot) for a data product WITHOUT deploying it. " +
      "This mirrors the Witboost UI 'New Snapshot' button: it captures the current catalog state " +
      "into a versioned release entity that can later be deployed or promoted independently. " +
      "IMPORTANT: only one snapshot can exist at a time — if one already exists, use it or " +
      "promote it first before creating a new one.",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product identifier in dot-notation (e.g. 'internalit.my-dp.0')",
        },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;

      const res = await ctx.api.post<any>(
        "/api/builder/releases",
        {},
        { dataproductEntityName: dpId, projectKind: "System" },
      );

      if (!res.ok) {
        const msg = res.error?.message ?? "";
        if (msg.toLowerCase().includes("snapshot") && msg.toLowerCase().includes("already exists")) {
          return text(
            `[SNAPSHOT_EXISTS] A snapshot already exists for \`${dpId}\`. ` +
            `Use \`list_releases\` to see it. Promote it first or deploy with \`releaseEntityName\` pointing to it.`,
            true,
          );
        }
        return apiError(res.error!.code, `Snapshot creation failed: ${msg}`);
      }

      const snapshotName =
        res.data?.releaseEntity?.metadata?.name ??
        res.data?.metadata?.name ??
        res.data?.name;
      const version =
        res.data?.releaseEntity?.metadata?.version ??
        res.data?.metadata?.version ??
        "—";

      return text(
        [
          `Snapshot created successfully.`,
          `- **Data Product**: ${dpId}`,
          `- **Snapshot name**: \`${snapshotName ?? "—"}\``,
          `- **Version**: ${version}`,
          ``,
          `You can now:`,
          `- \`deploy\` with \`releaseEntityName: "${snapshotName}"\` to deploy this snapshot`,
          `- \`promote_release\` with \`releaseEntityName: "${snapshotName}"\` to promote it to an official release`,
        ].join("\n"),
      );
    },
  },

  {
    name: "list_releases",
    description:
      "List all release entities (snapshots and releases) for a data product. " +
      "Use this to find the releaseEntityName needed for deploy, undeploy, or promote_release.",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product identifier in dot-notation (e.g. 'internalit.my-dp.0')",
        },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;

      const res = await ctx.api.get<any[]>("/api/builder/releases", {
        dataProductName: dpId,
        sortBy: "metadata.name",
        sortOrder: "desc",
      });


      const releases: any[] = Array.isArray(res.data) ? res.data : [];
      if (releases.length === 0) {
        return text(`No releases found for \`${dpId}\`. Create one by running \`deploy\`.`);
      }

      const snapshots = releases.filter((r: any) => r.metadata?.isSnapshot);
      const promoted = releases.filter((r: any) => !r.metadata?.isSnapshot);

      const lines = [
        `# Releases for ${dpId} (${releases.length} total)`,
        "",
      ];

      if (promoted.length) {
        lines.push("## Releases (promoted)");
        lines.push(...promoted.map(formatRelease));
        lines.push("");
      }
      if (snapshots.length) {
        lines.push("## Snapshots (not yet promoted)");
        lines.push(...snapshots.map(formatRelease));
      }

      return text(lines.join("\n"));
    },
  },

  {
    name: "deploy",
    description:
      "Deploy a data product to a target environment. " +
      "Creates a snapshot of the current catalog state, then deploys it. " +
      "To deploy a specific existing release/snapshot, provide releaseEntityName. " +
      "Returns a plan token and the release name used (needed for promote_release and get_deployment_logs).",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product identifier in dot-notation (e.g. 'internalit.my-dp.0')",
        },
        environment: { type: "string", description: "Target environment. Names are tenant-specific (e.g. 'dev'/'uat'/'prod' or 'development'/'production') — never assume; ask the user." },
        confirm: { type: "boolean", description: "Must be true to confirm deployment" },
        releaseEntityName: {
          type: "string",
          description:
            "Name of an existing release/snapshot to deploy (e.g. 'internalit.my-dp.0-SNAPSHOT-3'). " +
            "If omitted, a new snapshot is created automatically from the current catalog state.",
        },
        commit: {
          type: "boolean",
          description:
            "If true, commit pending builder-UI changes to git before snapshotting. " +
            "Default: false. Only needed when changes were made via the Witboost builder UI form.",
          default: false,
        },
      },
      required: ["dataProductId", "environment", "confirm"],
    },
    async handler(params, ctx) {
      if (params.confirm !== true) {
        return text("[CONFIRMATION_REQUIRED] Set confirm: true to deploy this data product.", true);
      }

      const dpId = params.dataProductId as string;
      const environment = params.environment as string;
      const doCommit = (params.commit as boolean) ?? false;
      let releaseName = params.releaseEntityName as string | undefined;

      // Optional: commit pending builder-UI changes
      if (doCommit) {
        const commitRes = await ctx.api.post<any>(
          "/api/builder/commit",
          {},
          { name: dpId, projectKind: "System" },
        );
        if (!commitRes.ok) return apiError(commitRes.error!.code, `Commit failed: ${commitRes.error!.message}`);
      }

      // Create snapshot if no explicit release provided
      if (!releaseName) {
        const snapshotRes = await ctx.api.post<any>(
          "/api/builder/releases",
          {},
          { dataproductEntityName: dpId, projectKind: "System" },
        );
        if (!snapshotRes.ok) {
          const msg = snapshotRes.error!.message ?? "";
          // If a snapshot already exists, suggest using it explicitly
          if (msg.toLowerCase().includes("snapshot") && msg.toLowerCase().includes("already exists")) {
            return text(
              `[SNAPSHOT_EXISTS] A snapshot already exists for \`${dpId}\`. ` +
              `Use \`list_releases\` to find it, then redeploy with \`releaseEntityName\` set to the snapshot name.`,
              true,
            );
          }
          return apiError(snapshotRes.error!.code, `Snapshot creation failed: ${msg}`);
        }
        releaseName =
          snapshotRes.data?.releaseEntity?.metadata?.name ??
          snapshotRes.data?.metadata?.name ??
          snapshotRes.data?.name;
        if (!releaseName) {
          return text(
            "[SNAPSHOT_ERROR] Snapshot created but could not extract release entity name from response. " +
            "Use list_releases to find it manually.",
            true,
          );
        }
      }

      // Deploy the release/snapshot — retry once on transient COR_PROV_GEN_4 preview errors
      let deployRes = await ctx.api.post<string>(
        `/api/builder/releases/${encodeURIComponent(releaseName)}/deploy`,
        {},
        { projectName: dpId, environment, projectKind: "System" },
      );

      if (!deployRes.ok && (deployRes.data as any)?.code === "COR_PROV_GEN_4") {
        // Transient "provisioning preview error" — wait 5 s and retry once
        await new Promise(resolve => setTimeout(resolve, 5000));
        deployRes = await ctx.api.post<string>(
          `/api/builder/releases/${encodeURIComponent(releaseName)}/deploy`,
          {},
          { projectName: dpId, environment, projectKind: "System" },
        );
      }

      if (!deployRes.ok) return richDeployError(deployRes);

      const planToken = typeof deployRes.data === "string" ? deployRes.data : (deployRes.data as any)?.token ?? "—";

      return text(
        [
          `Deployment started.`,
          `- **Data Product**: ${dpId}`,
          `- **Release used**: \`${releaseName}\``,
          `- **Environment**: ${environment}`,
          `- **Plan Token**: \`${planToken}\``,
          "",
          `Use \`get_deployment_status\` to monitor progress.`,
          `Use \`get_deployment_logs\` with \`planToken: "${planToken}"\` to view logs.`,
          `Use \`promote_release\` with \`releaseEntityName: "${releaseName}"\` to promote the snapshot to an official release.`,
        ].join("\n"),
      );
    },
  },

  {
    name: "promote_release",
    description:
      "Promote a snapshot to an official release. " +
      "This is an explicit step that marks the snapshot as production-ready. " +
      "Use the releaseEntityName returned by deploy.",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product identifier in dot-notation",
        },
        releaseEntityName: {
          type: "string",
          description: "Name of the snapshot to promote (e.g. 'internalit.my-dp.0-SNAPSHOT-3')",
        },
        confirm: { type: "boolean", description: "Must be true to confirm promotion" },
      },
      required: ["dataProductId", "releaseEntityName", "confirm"],
    },
    async handler(params, ctx) {
      if (params.confirm !== true) {
        return text("[CONFIRMATION_REQUIRED] Set confirm: true to promote this snapshot.", true);
      }

      const dpId = params.dataProductId as string;
      const snapshotName = params.releaseEntityName as string;

      const promoteQuery = new URLSearchParams({
        releaseEntityName: snapshotName,
        dataproductEntityName: dpId,
        projectKind: "System",
      }).toString();

      const res = await ctx.api.put<any>(
        `/api/builder/releases?${promoteQuery}`,
      );


      const promotedName =
        res.data?.metadata?.name ??
        res.data?.releaseEntity?.metadata?.name ??
        snapshotName.replace("-SNAPSHOT-", "-");

      return text(
        [
          `Release promoted successfully.`,
          `- **Data Product**: ${dpId}`,
          `- **Snapshot**: \`${snapshotName}\``,
          `- **Promoted release**: \`${promotedName}\``,
        ].join("\n"),
      );
    },
  },

  {
    name: "undeploy",
    description:
      "Undeploy a data product from an environment. " +
      "If only one release exists, it is used automatically. " +
      "If multiple releases exist for this DP, you MUST provide releaseEntityName explicitly. " +
      "Use list_releases to find available release names.",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product identifier in dot-notation (e.g. 'internalit.my-dp.0')",
        },
        environment: { type: "string", description: "Environment to undeploy from" },
        confirm: { type: "boolean", description: "Must be true to confirm undeployment" },
        releaseEntityName: {
          type: "string",
          description:
            "Name of the release to undeploy. Required if multiple releases exist. " +
            "Use list_releases to find it.",
        },
        removeData: {
          type: "boolean",
          description: "If true, also delete underlying infrastructure data (default: false)",
        },
      },
      required: ["dataProductId", "environment", "confirm"],
    },
    async handler(params, ctx) {
      if (params.confirm !== true) {
        return text("[CONFIRMATION_REQUIRED] Set confirm: true to undeploy.", true);
      }

      const dpId = params.dataProductId as string;
      const environment = params.environment as string;
      const removeData = (params.removeData as boolean) ?? false;
      let releaseName = params.releaseEntityName as string | undefined;

      // Auto-detect release if not provided
      if (!releaseName) {
        const listRes = await ctx.api.get<any[]>("/api/builder/releases", {
          dataProductName: dpId,
          sortBy: "metadata.name",
          sortOrder: "desc",
        });
        if (!listRes.ok) return apiError(listRes.error!.code, listRes.error!.message);

        const releases: any[] = Array.isArray(listRes.data) ? listRes.data : [];
        // Prefer non-snapshot (promoted) releases; fall back to snapshots
        const nonSnapshots = releases.filter((r: any) => !r.metadata?.isSnapshot);
        const candidates = nonSnapshots.length ? nonSnapshots : releases;

        if (candidates.length === 0) {
          return text(`[NOT_DEPLOYED] No releases found for \`${dpId}\`. Nothing to undeploy.`, true);
        }

        if (candidates.length > 1) {
          const names = candidates.map((r: any) => `  - \`${r.metadata?.name}\``).join("\n");
          return text(
            `[AMBIGUOUS_RELEASE] Multiple releases found for \`${dpId}\`. Provide releaseEntityName explicitly:\n${names}\n\nUse list_releases to see all options.`,
            true,
          );
        }

        releaseName = candidates[0].metadata?.name;
        if (!releaseName) {
          return text("[RELEASE_ERROR] Could not extract release name. Use list_releases and provide releaseEntityName explicitly.", true);
        }
      }

      const undeployQuery = new URLSearchParams({
        projectName: dpId,
        environment,
        projectKind: "System",
      }).toString();
      const res = await ctx.api.delete<string>(
        `/api/builder/releases/${encodeURIComponent(releaseName)}/deploy?${undeployQuery}`,
      );

      if (!res.ok) return richDeployError(res);

      const planToken = typeof res.data === "string" ? res.data : (res.data as any)?.token ?? "—";

      return text(
        [
          `Undeployment started.`,
          `- **Data Product**: ${dpId}`,
          `- **Release used**: \`${releaseName}\``,
          `- **Environment**: ${environment}`,
          `- **Plan Token**: \`${planToken}\``,
          "",
          `Use \`get_deployment_status\` to monitor progress.`,
          `Use \`get_deployment_logs\` with \`planToken: "${planToken}"\` to view logs.`,
        ].join("\n"),
      );
    },
  },

  {
    name: "get_deployment_status",
    description:
      "Get the current provisioning status of a data product. " +
      "Returns overall status (DEPLOYED, NOT_DEPLOYED, PROVISIONING_IN_PROGRESS, CORRUPT, etc.) " +
      "and per-component breakdown.",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product identifier in dot-notation (e.g. 'internalit.my-dp.0')",
        },
        environment: { type: "string", description: "Environment name" },
      },
      required: ["dataProductId", "environment"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;
      const environment = params.environment as string;

      const res = await ctx.api.get<any>(
        `/api/builder/deployment-units/${encodeURIComponent(toUrn(dpId))}/provisioning-status`,
        { environment, "include-descriptor": false },
      );


      const data = res.data;
      const overall = data?.status ?? "—";
      const details = data?.provisioningDetails;

      const lines = [
        `## Deployment Status: ${dpId}`,
        `- **Environment**: ${environment}`,
        `- **Status**: ${overall}`,
      ];

      if (details) {
        lines.push(`- **Descriptor version**: ${details.descriptorVersion ?? "—"}`);
        const components: any[] = details.componentsStatus ?? [];
        if (components.length > 0) {
          lines.push("", "**Components:**");
          for (const c of components) {
            const icon = c.status === "DEPLOYED" ? "✅"
              : c.status === "NOT_DEPLOYED" ? "⬜"
              : c.status === "PROVISIONING_IN_PROGRESS" ? "⏳"
              : "❌";
            lines.push(`- ${icon} \`${c.componentId}\`: ${c.status}`);
          }
        }
      }

      return text(lines.join("\n"));
    },
  },

  {
    name: "get_deployment_logs",
    description:
      "Retrieve provisioning logs for a deployment using the plan token returned by deploy or undeploy. " +
      "Look for ERROR and FATAL entries to diagnose failures.",
    category: "provisioning",
    inputSchema: {
      type: "object",
      properties: {
        planToken: {
          type: "string",
          description: "Plan token returned by deploy or undeploy (e.g. 'aa53de04-f563-4bd3-9407-fb963a00d26b')",
        },
      },
      required: ["planToken"],
    },
    async handler(params, ctx) {
      const token = params.planToken as string;

      const res = await ctx.api.get<any>(`/api/builder/logs/${token}`);


      const entries: any[] = Array.isArray(res.data) ? res.data : res.data?.logs ?? [];
      if (entries.length === 0) return text(`No logs found for plan token: ${token}`);

      const logLines = entries.map((e: any) => {
        if (typeof e === "string") return e;
        const ts = e.timestamp ?? e.time ?? "";
        const level = e.level ?? "INFO";
        const msg = e.message ?? e.msg ?? JSON.stringify(e);
        return `[${ts}] [${level}] ${msg}`;
      });

      const errorCount = logLines.filter(l => /\[ERROR\]|\[FATAL\]/i.test(l)).length;
      const header = `Logs for plan \`${token}\`${errorCount ? ` — ⚠️ ${errorCount} ERROR/FATAL entries` : ""}:`;

      return text(`${header}

\`\`\`
${logLines.join("\n")}
\`\`\``);
    },
  },
];

registerTools(provisioningTools);
