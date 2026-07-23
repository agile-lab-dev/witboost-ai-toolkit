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

/** Extract both HTTPS and SSH Git URLs from entity annotations (GitLab only) */
function extractRepoUrls(entity: any): RepoUrls | undefined {
  // Primary: gitlab.com/project-slug → group/subgroup/repo
  const slug = entity.metadata?.annotations?.["gitlab.com/project-slug"];
  if (slug && !slug.includes("undefined") && !slug.includes("${{")) {
    return { httpUrl: `https://gitlab.com/${slug}.git`, sshUrl: `git@gitlab.com:${slug}.git` };
  }
  // Fallback: parse source-location or repo-url
  const srcLoc =
    entity.metadata?.annotations?.["backstage.io/source-location"] ??
    entity.metadata?.annotations?.["witboost.com/repo-url"];
  if (srcLoc) {
    const cleaned = srcLoc.replace(/^url:/, "");
    const match = cleaned.match(/https:\/\/gitlab\.com\/([^/]+(?:\/[^/]+)*?)(?:\/-\/|\/?$)/);
    if (match) return { httpUrl: `https://gitlab.com/${match[1]}.git`, sshUrl: `git@gitlab.com:${match[1]}.git` };
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
      const dpUrls = extractRepoUrls(dpRes.data);
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
          const urls = extractRepoUrls(res.data);
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
