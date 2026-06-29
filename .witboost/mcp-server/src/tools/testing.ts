import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { registerTools } from "./registry.js";
import type { ToolDefinition, ToolResult } from "./types.js";

function text(msg: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: msg }], isError };
}

function apiError(code: string, message: string): ToolResult {
  return text(`[${code}] ${message}`, true);
}

interface ValidateResult {
  validationPhaseKind: string;
  status: string;
  errors: {
    errors: Array<{ code?: string; userMessage?: string; message?: string; input?: string; inputErrorField?: string; moreInfo?: string }>;
    code?: string;
    userMessage?: string;
    input?: string;
    inputErrorField?: string;
    moreInfo?: string;
  };
  validatedDescriptor?: string | null;
}

interface ValidateResponse {
  httpStatus: number;
  body: { results: ValidateResult[] };
}

const testingTools: ToolDefinition[] = [
  {
    name: "build_descriptor",
    description:
      "Generate a rendered deployment descriptor for a data product. " +
      "The descriptor is a YAML document that merges catalog-info.yaml, template parameters, " +
      "and environment-specific configurations into a single deployable unit. " +
      "This is a prerequisite for validation and deployment. " +
      "IMPORTANT: Always ask the user which environment to target before calling this tool.",
    category: "testing",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description:
            "Data product identifier in dot-notation (e.g. 'finance.cashflow.0'). " +
            "Use the entity name from the catalog without 'system:' prefix.",
        },
        environment: {
          type: "string",
          description: "Target environment (e.g. 'production', 'development'). Ask the user which environment to use.",
        },
        version: {
          type: "string",
          description: "Version of the data product (e.g. '0.0.0'). Defaults to '0.0.0'.",
        },
        includeComponents: {
          type: "boolean",
          description: "Whether to include component descriptors. Defaults to true.",
        },
      },
      required: ["dataProductId", "environment"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;
      const environment = params.environment as string;
      const version = (params.version as string) ?? "0.0.0";
      const includeComponents = (params.includeComponents as boolean) ?? true;

      if (!environment) {
        return text(
          "[ENVIRONMENT_REQUIRED] You must specify the target environment (e.g. 'development', 'production'). Ask the user which environment to use.",
          true,
        );
      }

      const res = await ctx.api.post<{ descriptor: string }>(
        "/api/builder/dataproducts/preview",
        undefined,
        {
          dataProduct: dpId,
          projectKind: "System",
          environment,
          version,
          bypassCache: true,
          hideComponents: !includeComponents,
        },
      );

      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const descriptor = res.data?.descriptor;
      if (!descriptor) {
        return text("[NO_DESCRIPTOR] Preview API returned no descriptor.", true);
      }

      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: `witboost://descriptor/${dpId}/${environment}`,
              mimeType: "application/x-yaml",
              text: descriptor,
            },
          },
          {
            type: "text",
            text:
              `Descriptor built for **${dpId}** (env: ${environment}, version: ${version}).\n` +
              `Components included: ${includeComponents ? "yes" : "no"}\n` +
              `Descriptor length: ${descriptor.length} chars`,
          },
        ],
      };
    },
  },
  {
    name: "validate_descriptor",
    description:
      "Validate a data product descriptor against governance policies and provisioner checks. " +
      "Can validate either via the Witboost API (build + validate in one step) or a local YAML file. " +
      "API validation runs the full pipeline: data product validation, policy checks, " +
      "and component-level provisioner validation. " +
      "IMPORTANT: Always ask the user which environment to target before calling this tool.",
    category: "testing",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description:
            "Data product identifier in dot-notation (e.g. 'finance.cashflow.0'). " +
            "When provided, the descriptor is built from the platform and validated via the API.",
        },
        environment: {
          type: "string",
          description: "Target environment for API validation. Ask the user which environment to use.",
        },
        version: {
          type: "string",
          description: "Version for API validation. Defaults to '0.0.0'.",
        },
        descriptorPath: {
          type: "string",
          description: "Local path to a YAML descriptor file for offline structural validation.",
        },
      },
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string | undefined;
      const descriptorPath = params.descriptorPath as string | undefined;

      if (!dpId && !descriptorPath) {
        return text(
          "[VALIDATION_ERROR] Provide either dataProductId (for API validation) or descriptorPath (for local validation).",
          true,
        );
      }

      // Local file validation
      if (descriptorPath) {
        if (!existsSync(descriptorPath)) {
          return text(`[NOT_FOUND] File not found: ${descriptorPath}`, true);
        }

        try {
          const content = readFileSync(descriptorPath, "utf-8");
          const parsed = parseYaml(content);

          if (!parsed || typeof parsed !== "object") {
            return text("[PARSE_ERROR] Descriptor is not valid YAML.", true);
          }

          const issues: string[] = [];
          const meta = (parsed as any).metadata;
          if (!meta?.name) issues.push("Missing metadata.name");
          if (!meta?.description) issues.push("Missing metadata.description");

          if (issues.length > 0) {
            return text(
              `Descriptor validation **failed**:\n\n${issues.map((i) => `- ❌ ${i}`).join("\n")}`,
            );
          }

          return text("Descriptor validation **passed**. No structural issues found.");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return text(`[PARSE_ERROR] Failed to parse descriptor: ${msg}`, true);
        }
      }

      // API validation: build descriptor then validate
      const environment = params.environment as string;
      const version = (params.version as string) ?? "0.0.0";

      if (!environment) {
        return text(
          "[ENVIRONMENT_REQUIRED] You must specify the target environment (e.g. 'development', 'production'). Ask the user which environment to use.",
          true,
        );
      }

      // Step 1: Build descriptor via preview API
      const previewRes = await ctx.api.post<{ descriptor: string }>(
        "/api/builder/dataproducts/preview",
        undefined,
        {
          dataProduct: dpId,
          projectKind: "System",
          environment,
          version,
          bypassCache: true,
          hideComponents: false,
        },
      );

      if (!previewRes.ok) {
        return apiError(
          previewRes.error!.code,
          `Failed to build descriptor: ${previewRes.error!.message}`,
        );
      }

      const descriptor = previewRes.data?.descriptor;
      if (!descriptor) {
        return text("[NO_DESCRIPTOR] Preview API returned no descriptor.", true);
      }

      // Step 2: Validate via coordinator
      const validateRes = await ctx.api.post<ValidateResponse>(
        `/api/builder/dataproducts/${dpId}/validate`,
        {
          descriptor,
          version,
          environment,
          projectKind: "System",
        },
      );

      if (!validateRes.ok) {
        return apiError(
          validateRes.error!.code,
          `Validation API error: ${validateRes.error!.message}`,
        );
      }

      const results: ValidateResult[] =
        validateRes.data?.body?.results ?? (validateRes.data as any)?.results ?? [];

      if (results.length === 0) {
        return text("Validation completed but returned no results.");
      }

      const isSuccess = (r: ValidateResult) => {
        const hasErrors = (r.errors?.errors?.length ?? 0) > 0 || !!r.errors?.userMessage;
        if (r.status === "PASSED" || r.status === "OK") return true;
        if (r.status === "COMPLETED" && !hasErrors) return true;
        return false;
      };

      const passed = results.filter(isSuccess);
      const failed = results.filter((r) => !isSuccess(r));

      const lines: string[] = [
        `Validation for **${dpId}** (env: ${environment}):\n`,
        `**${passed.length}** passed, **${failed.length}** failed\n`,
      ];

      for (const r of results) {
        const icon = isSuccess(r) ? "✅" : "❌";
        lines.push(`- ${icon} **${r.validationPhaseKind}**: ${r.status}`);

        const errs = r.errors?.errors ?? [];
        if (errs.length > 0) {
          for (const e of errs) {
            if (typeof e === "string") {
              // CUE policy errors come as plain strings
              lines.push(`  - ${e.split("\n")[0]}`);
            } else {
              const msg = e.userMessage || e.message || e.code || "Unknown error";
              lines.push(`  - ${msg}`);
              if (e.inputErrorField) lines.push(`    Field: \`${e.inputErrorField}\``);
              if (e.moreInfo) lines.push(`    Info: ${e.moreInfo}`);
            }
          }
        } else if (r.errors?.userMessage) {
          lines.push(`  - ${r.errors.userMessage}`);
        } else if (r.errors) {
          // Dump the raw error object for debugging when no structured fields are found
          const raw = JSON.stringify(r.errors, null, 2);
          if (raw !== '{}' && raw !== 'null') {
            lines.push(`  - Raw error: ${raw.substring(0, 500)}`);
          }
        }
      }

      return text(lines.join("\n"));
    },
  },
  {
    name: "run_tests",
    description: "Trigger test execution for a data product component. Runs provisioner-level tests.",
    category: "testing",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product identifier in dot-notation (e.g. 'finance.cashflow.0')",
        },
        testSuite: { type: "string", description: "Specific test suite to run (optional)" },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;
      const testSuite = params.testSuite as string | undefined;

      const body: Record<string, unknown> = { dataProductId: dpId };
      if (testSuite) body.testSuite = testSuite;

      const res = await ctx.api.post<any>("/api/testing/run", body);
      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      return text(
        `Test execution started.\n- **Execution ID**: ${res.data?.id ?? "—"}\n- **Status**: ${res.data?.status ?? "running"}`,
      );
    },
  },
  {
    name: "get_test_results",
    description: "Get results of a test execution",
    category: "testing",
    inputSchema: {
      type: "object",
      properties: {
        dataProductId: {
          type: "string",
          description: "Data product identifier in dot-notation (e.g. 'finance.cashflow.0')",
        },
        testExecutionId: {
          type: "string",
          description: "Test execution ID (optional — returns latest if omitted)",
        },
      },
      required: ["dataProductId"],
    },
    async handler(params, ctx) {
      const dpId = params.dataProductId as string;
      const execId = params.testExecutionId as string | undefined;

      const path = execId
        ? `/api/testing/results/${dpId}/${execId}`
        : `/api/testing/results/${dpId}/latest`;

      const res = await ctx.api.get<any>(path);
      if (!res.ok) return apiError(res.error!.code, res.error!.message);

      const results = res.data?.tests ?? [];
      const passed = results.filter((t: any) => t.status === "passed").length;
      const failed = results.filter((t: any) => t.status === "failed").length;
      const skipped = results.filter((t: any) => t.status === "skipped").length;

      const lines = [
        `Test results: **${passed}** passed, **${failed}** failed, **${skipped}** skipped\n`,
      ];

      for (const t of results) {
        const icon = t.status === "passed" ? "✅" : t.status === "failed" ? "❌" : "⏭️";
        lines.push(`- ${icon} **${t.name}** (${t.duration ?? 0}ms)`);
        if (t.message) lines.push(`  ${t.message}`);
      }

      return text(lines.join("\n"));
    },
  },
];

registerTools(testingTools);
