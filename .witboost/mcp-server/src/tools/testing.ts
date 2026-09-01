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
    errors: Array<string | { code?: string; userMessage?: string; message?: string; input?: string; inputErrorField?: string; moreInfo?: string }>;
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

interface ProvisioningPlanResponse {
  provisioningPlans?: ProvisioningPlan[];
}

interface ProvisioningPlan {
  environment?: string;
  dag?: ProvisioningTask;
}

interface ProvisioningTask {
  id?: string;
  action?: string;
  displayName?: string;
  name?: string;
  status?: string;
  result?: string | null;
  version?: string;
  startTime?: string;
  stopTime?: string;
  dependsOnTasks?: ProvisioningTask[];
}

interface PolicyEvaluationReport {
  status?: string;
  id?: string;
  evaluationScope?: string;
  environment?: string;
  evaluationResults?: PolicyEvaluationResult[];
}

interface PolicyEvaluationResult {
  governanceEntityId?: string;
  governanceEntityStatus?: string;
  governanceEntityType?: string;
  outcome?: string;
  resource?: { id?: string; displayName?: string; environment?: string; resourceType?: string };
  result?: { isError?: boolean; satisfiesPolicy?: boolean; errors?: string[] };
  creationTime?: string;
}

type ValidationSeverity = "passed" | "warning" | "failed";

interface PolicyEvaluationSummary {
  planId?: string;
  planStatus?: string;
  planStartTime?: string;
  validationTaskId?: string;
  reportStatus?: string;
  reportId?: string;
  evaluations: PolicyEvaluationResult[];
}

function dataProductIdToUrn(dataProductId: string): string {
  if (dataProductId.startsWith("urn:")) return dataProductId;

  const parts = dataProductId.split(".");
  if (parts.length < 3) return dataProductId;

  const domain = parts[0];
  const majorVersion = parts[parts.length - 1];
  const name = parts.slice(1, -1).join(".");
  return `urn:dmb:dp:${domain}:${name}:${majorVersion}`;
}

function descriptorVersion(descriptor: string, fallback: string): string {
  try {
    const parsed = parseYaml(descriptor) as { version?: unknown } | undefined;
    return typeof parsed?.version === "string" ? parsed.version : fallback;
  } catch {
    return fallback;
  }
}

function flattenTasks(task: ProvisioningTask | undefined): ProvisioningTask[] {
  if (!task) return [];
  return [task, ...(task.dependsOnTasks ?? []).flatMap(flattenTasks)];
}

function parsePolicyEvaluationReport(task: ProvisioningTask | undefined): PolicyEvaluationReport | undefined {
  if (!task?.result) return undefined;
  try {
    return JSON.parse(task.result) as PolicyEvaluationReport;
  } catch {
    return undefined;
  }
}

function policyEvaluationSeverity(evaluation: PolicyEvaluationResult): ValidationSeverity {
  const outcome = evaluation.outcome?.toLowerCase();
  const governanceStatus = evaluation.governanceEntityStatus?.toLowerCase();
  const satisfiesPolicy = evaluation.result?.satisfiesPolicy;

  if (satisfiesPolicy === true || outcome === "ok") return "passed";
  if (outcome === "warning" || governanceStatus === "grace") return "warning";
  if (evaluation.result?.isError || outcome === "error" || outcome === "failed") return "failed";
  if (satisfiesPolicy === false) return governanceStatus === "enabled" ? "failed" : "warning";

  return "passed";
}

function validationPhaseSeverity(result: ValidateResult, policySummary?: PolicyEvaluationSummary): ValidationSeverity {
  const hasErrors = (result.errors?.errors?.length ?? 0) > 0 || !!result.errors?.userMessage;
  if (result.status === "PASSED" || result.status === "OK") return "passed";
  if (result.status === "COMPLETED" && !hasErrors) return "passed";

  if (result.validationPhaseKind.startsWith("POLICY_") && policySummary) {
    const policySeverities = policySummary.evaluations.map(policyEvaluationSeverity);
    if (policySeverities.includes("failed")) return "failed";
    if (policySeverities.includes("warning")) return "warning";
  }

  return "failed";
}

function severityIcon(severity: ValidationSeverity): string {
  if (severity === "passed") return "✅";
  if (severity === "warning") return "⚠️";
  return "❌";
}

function countBySeverity<T>(items: T[], classifier: (item: T) => ValidationSeverity) {
  return items.reduce(
    (acc, item) => {
      acc[classifier(item)] += 1;
      return acc;
    },
    { passed: 0, warning: 0, failed: 0 },
  );
}

function firstErrorLine(error: string): string {
  return error.split("\n")[0];
}

function descriptorLocations(error: string): string[] {
  return error
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^descriptor:\d+:\d+$/.test(line));
}

async function getLatestPolicyEvaluationSummary(
  ctx: Parameters<ToolDefinition["handler"]>[1],
  dataProductId: string,
  environment: string,
  version: string,
): Promise<PolicyEvaluationSummary | undefined> {
  const planRes = await ctx.api.get<ProvisioningPlanResponse>("/api/builder/provisioningplan", {
    "data-product-id": dataProductIdToUrn(dataProductId),
    environments: environment,
    "include-snapshot": "true",
    "include-descriptors": "false",
    version,
    operations: "VALIDATION",
    offset: 0,
    limit: 1,
    ordering: "desc",
  });

  if (!planRes.ok) return undefined;

  const plan = planRes.data?.provisioningPlans?.[0];
  const cgpTask = flattenTasks(plan?.dag).find((task) => task.action === "POLICY_VALIDATE_COMPONENT");
  const report = parsePolicyEvaluationReport(cgpTask);

  if (!report?.evaluationResults) return undefined;

  return {
    planId: plan?.dag?.id,
    planStatus: plan?.dag?.status,
    planStartTime: plan?.dag?.startTime,
    validationTaskId: cgpTask?.id,
    reportStatus: report.status,
    reportId: report.id,
    evaluations: report.evaluationResults,
  };
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
          description: "Target environment. Names are tenant-specific (e.g. 'dev'/'uat'/'prod' or 'development'/'production') — never assume; ask the user which exact environment to use.",
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
          "[ENVIRONMENT_REQUIRED] You must specify the target environment. Names are tenant-specific (e.g. 'dev'/'uat'/'prod' or 'development'/'production') — never assume; ask the user which exact environment to use.",
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
      if (!dpId) {
        return text("[VALIDATION_ERROR] Provide dataProductId for API validation.", true);
      }

      const environment = params.environment as string;
      const version = (params.version as string) ?? "0.0.0";

      if (!environment) {
        return text(
          "[ENVIRONMENT_REQUIRED] You must specify the target environment. Names are tenant-specific (e.g. 'dev'/'uat'/'prod' or 'development'/'production') — never assume; ask the user which exact environment to use.",
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
        // Surface problems[] and solutions[] from the response body (e.g. COR_PARSE_DESCR_1)
        // so the agent can read the actual cause instead of a generic INTERNAL_ERROR message.
        const body: any = validateRes.data ?? {};
        const problems: string[] = Array.isArray(body.problems) ? body.problems : [];
        const solutions: string[] = Array.isArray(body.solutions) ? body.solutions : [];
        const code = validateRes.error!.code;
        const msg = validateRes.error!.message;
        const lines = [`[${code}] Validation API error: ${msg}`];
        if (problems.length) {
          lines.push("", "**Problems:**");
          problems.forEach((p: string) => lines.push(`- ${p}`));
        }
        if (solutions.length) {
          lines.push("", "**Solutions:**");
          solutions.forEach((s: string) => lines.push(`- ${s}`));
        }
        if (!problems.length && !solutions.length && body && typeof body === "object") {
          lines.push("", "**Raw response:**");
          lines.push("```json");
          lines.push(JSON.stringify(body, null, 2));
          lines.push("```");
        }
        return text(lines.join("\n"), true);
      }

      const results: ValidateResult[] =
        validateRes.data?.body?.results ?? (validateRes.data as any)?.results ?? [];

      if (results.length === 0) {
        return text("Validation completed but returned no results.");
      }

      const effectiveVersion = descriptorVersion(descriptor, version);
      const policySummary = await getLatestPolicyEvaluationSummary(ctx, dpId, environment, effectiveVersion);
      const phaseCounts = countBySeverity(results, (r) => validationPhaseSeverity(r, policySummary));

      const lines: string[] = [
        `Validation for **${dpId}** (env: ${environment}):\n`,
        `**${phaseCounts.passed}** passed, **${phaseCounts.warning}** warnings, **${phaseCounts.failed}** failed\n`,
      ];

      if (policySummary) {
        const policyCounts = countBySeverity(policySummary.evaluations, policyEvaluationSeverity);
        lines.push(
          `Policy evaluation report: **${policyCounts.passed}** passed, **${policyCounts.warning}** warnings, **${policyCounts.failed}** failed`,
        );
        if (policySummary.reportStatus) lines.push(`Report status: ${policySummary.reportStatus}`);
        if (policySummary.planId) lines.push(`Validation plan: \`${policySummary.planId}\``);
        lines.push("");

        for (const evaluation of policySummary.evaluations) {
          const severity = policyEvaluationSeverity(evaluation);
          const policyId = evaluation.governanceEntityId ?? "unknown-policy";
          const status = evaluation.governanceEntityStatus ?? "—";
          const outcome = evaluation.outcome ?? "—";
          const satisfiesPolicy = evaluation.result?.satisfiesPolicy;

          lines.push(`- ${severityIcon(severity)} Policy \`${policyId}\`: ${outcome}`);
          lines.push(`  Status: ${status}`);
          if (satisfiesPolicy !== undefined) lines.push(`  Satisfies policy: ${satisfiesPolicy}`);

          for (const error of evaluation.result?.errors ?? []) {
            lines.push(`  - ${firstErrorLine(error)}`);
            for (const location of descriptorLocations(error)) {
              lines.push(`    Descriptor location: ${location}`);
            }
          }
        }

        lines.push("", "Validation phases:");
      } else {
        lines.push(
          "Policy evaluation report was not available from the latest VALIDATION provisioning plan; showing validation phases only.",
          "",
        );
      }

      for (const r of results) {
        const phaseSeverity = validationPhaseSeverity(r, policySummary);
        const icon = severityIcon(phaseSeverity);
        lines.push(`- ${icon} **${r.validationPhaseKind}**: ${r.status}`);

        const errs = r.errors?.errors ?? [];
        if (errs.length > 0) {
          for (const e of errs) {
            if (typeof e === "string") {
              // CUE policy errors come as plain strings
              lines.push(`  - ${firstErrorLine(e)}`);
              for (const location of descriptorLocations(e)) {
                lines.push(`    Descriptor location: ${location}`);
              }
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
