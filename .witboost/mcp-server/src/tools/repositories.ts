import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

interface RepoUrls {
  httpUrl: string;
  sshUrl: string;
}

/** Extract both HTTPS and SSH Git URLs from entity annotations */
function extractRepoUrls(entity: any, gitHost: string): RepoUrls | undefined {
  // Primary: any */project-slug annotation → group/subgroup/repo
  const annotations: Record<string, unknown> = entity.metadata?.annotations ?? {};
  const slugKey = Object.keys(annotations).find((k) => k.endsWith("/project-slug"));
  const slug = slugKey ? (annotations[slugKey] as string | undefined) : undefined;
  if (slug && !slug.includes("undefined") && !slug.includes("${{")) {
    return { httpUrl: `https://${gitHost}/${slug}.git`, sshUrl: `git@${gitHost}:${slug}.git` };
  }
  // Fallback: use source-location or repo-url annotation verbatim
  const srcLoc =
    entity.metadata?.annotations?.["backstage.io/source-location"] ??
    entity.metadata?.annotations?.["witboost.com/repo-url"];
  if (srcLoc) {
    const cleaned = (srcLoc as string).replace(/^url:/, "").trim();
    if (cleaned.startsWith("http")) {
      const base = cleaned.replace(/\/-\/.*$/, "").replace(/\/+$/, "").replace(/\.git$/, "");
      const httpUrl = `${base}.git`;
      const sshUrl = httpUrl.replace(/^https?:\/\/([^/]+)\//, "git@$1:");
      return { httpUrl, sshUrl };
    }
  }
  return undefined;
}

const repositoryTools: ToolDefinition[] = [
  {
    name: "list_repositories",
    description:
      "List Git repositories associated with a data product (system repo + all component repos). " +
      "Returns both HTTPS and SSH clone URLs for each repository. Do NOT guess repo URLs — always call this tool instead.",
    category: "repositories",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: { type: "string", description: "Data product identifier" },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;

      const dpRes = await ctx.api.get<any>(`/api/catalog/entities/by-name/system/default/${dpId}`);
      if (!dpRes.ok) return apiError(dpRes.error!.code, dpRes.error!.message);

      const repos: { name: string; urls: RepoUrls; entity: string }[] = [];

      // Include the system (DP) repo itself
      const dpUrls = extractRepoUrls(dpRes.data, ctx.config.gitHost);
      if (dpUrls) {
        repos.push({
          name: dpRes.data.metadata?.name ?? dpId,
          urls: dpUrls,
          entity: `system:default/${dpId}`,
        });
      }

      // Include component repos
      const componentRefs = dpRes.data.relations
        ?.filter((r: any) => r.type === "hasPart")
        ?.map((r: any) => r.targetRef) ?? [];

      for (const ref of componentRefs) {
        const res = await ctx.api.get<any>(`/api/catalog/entities/by-name/${ref.replace(":", "/")}`);
        if (res.ok) {
          const urls = extractRepoUrls(res.data, ctx.config.gitHost);
          if (urls) {
            repos.push({
              name: res.data.metadata?.name ?? ref,
              urls,
              entity: ref,
            });
          }
        }
      }

      if (repos.length === 0) return text("No repositories found for this data product.");

      const lines = repos.map(
        (r) => `- **${r.name}**\n  HTTPS: ${r.urls.httpUrl}\n  SSH: ${r.urls.sshUrl}\n  Entity: ${r.entity}`,
      );

      return text(
        `Repositories (${repos.length}):\n\n${lines.join("\n\n")}\n\n` +
        `> Use these exact URLs (HTTPS or SSH) to clone. Do NOT modify or guess URLs.`,
      );
    },
  },
];

registerTools(repositoryTools);
