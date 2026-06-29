import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

/** Extract a clone-ready Git URL from entity annotations */
function extractCloneUrl(entity: any): string | undefined {
  // Primary: gitlab.com/project-slug → https://gitlab.com/<slug>.git
  const slug = entity.metadata?.annotations?.["gitlab.com/project-slug"];
  if (slug && !slug.includes("undefined") && !slug.includes("${{")) {
    return `https://gitlab.com/${slug}.git`;
  }
  // Fallback: parse source-location or repo-url
  const srcLoc =
    entity.metadata?.annotations?.["backstage.io/source-location"] ??
    entity.metadata?.annotations?.["witboost.com/repo-url"];
  if (srcLoc) {
    const cleaned = srcLoc.replace(/^url:/, "");
    const match = cleaned.match(/https:\/\/gitlab\.com\/([^/]+(?:\/[^/]+)*?)(?:\/-\/|\/?$)/);
    if (match) return `https://gitlab.com/${match[1]}.git`;
  }
  return undefined;
}

const repositoryTools: ToolDefinition[] = [
  {
    name: "list_repositories",
    description:
      "List Git repositories associated with a data product (system repo + all component repos). " +
      "Returns clone-ready URLs. Always call this BEFORE clone_repository — do NOT guess repo URLs.",
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

      const repos: { name: string; url: string; entity: string }[] = [];

      // Include the system (DP) repo itself
      const dpUrl = extractCloneUrl(dpRes.data);
      if (dpUrl) {
        repos.push({
          name: dpRes.data.metadata?.name ?? dpId,
          url: dpUrl,
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
          const url = extractCloneUrl(res.data);
          if (url) {
            repos.push({
              name: res.data.metadata?.name ?? ref,
              url,
              entity: ref,
            });
          }
        }
      }

      if (repos.length === 0) return text("No repositories found for this data product.");

      const lines = repos.map(
        (r) => `- **${r.name}**\n  Clone URL: ${r.url}\n  Entity: ${r.entity}`,
      );

      return text(
        `Repositories (${repos.length}):\n\n${lines.join("\n\n")}\n\n` +
        `> Use these exact Clone URLs with \`clone_repository\`. Do NOT modify or guess URLs.`,
      );
    },
  },
  {
    name: "clone_repository",
    description:
      "Clone a data product repository to the local workspace. " +
      "IMPORTANT: Always call list_repositories first to get the correct URL. " +
      "Do NOT guess or construct repository URLs — they have non-obvious nested paths.",
    category: "repositories",
    inputSchema: {
      type: "object",
      properties: {
        repositoryUrl: { type: "string", description: "Git repository URL" },
        targetPath: {
          type: "string",
          description: "Local path to clone to (optional, defaults to repo name in current directory)",
        },
      },
      required: ["repositoryUrl"],
    },
    async handler(params) {
      const repoUrl = params.repositoryUrl as string;
      const targetPath = params.targetPath as string | undefined;

      // Derive target directory from URL if not specified
      const repoName = repoUrl.split("/").pop()?.replace(/\.git$/, "") ?? "repo";
      const target = targetPath ?? repoName;

      if (existsSync(target)) {
        return text(`[PATH_EXISTS] Directory already exists: ${target}`, true);
      }

      try {
        execSync(`git clone "${repoUrl}" "${target}"`, {
          encoding: "utf-8",
          timeout: 60_000,
        });

        // Get default branch
        let branch = "main";
        try {
          branch = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: target,
            encoding: "utf-8",
          }).trim();
        } catch {
          // ignore
        }

        return text(`Repository cloned successfully.\n- **Path**: ${target}\n- **Branch**: ${branch}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return text(`[GIT_ERROR] Failed to clone repository: ${message}`, true);
      }
    },
  },
];

registerTools(repositoryTools);
