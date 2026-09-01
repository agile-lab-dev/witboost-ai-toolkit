import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolContext } from "../../../src/tools/types.js";
import type { WitboostConfig } from "../../../src/config/schema.js";
import { WitboostApiClient } from "../../../src/api/client.js";
import { getTool } from "../../../src/tools/registry.js";

// Import blueprint tools so they register themselves
import "../../../src/tools/blueprints.js";

function makeConfig(overrides: Partial<WitboostConfig> = {}): WitboostConfig {
  return {
    baseUrl: "https://ui.test.witboost.com",
    token: "test-token",
    defaultDomain: "",
    defaultEnvironment: "",
    apiVersion: "v1",
    requestTimeout: 5000,
    ...overrides,
  };
}

function makeContext(overrides: Partial<WitboostConfig> = {}): ToolContext {
  const config = makeConfig(overrides);
  return {
    config,
    api: new WitboostApiClient(config),
  };
}

function mockJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
  };
}

function resultText(result: Awaited<ReturnType<NonNullable<ReturnType<typeof getTool>>["handler"]>>): string {
  return (result.content[0] as { type: "text"; text: string }).text;
}

describe("get_blueprint", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Regression test: templates returned by the catalog without an explicit
  // `dependencies` field used to crash topoSortTemplates' output with
  // "TypeError: Cannot read properties of undefined (reading 'length')"
  // because the step-formatting code read `t.dependencies.length` directly.
  it("does not throw when a template entry has no dependencies field", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse({
        metadata: { name: "data-product-blueprint", title: "Data Product Blueprint" },
        spec: {
          mainTemplateId: "template:default/dataproduct-template",
          templates: [
            { id: "template:default/google-cloud-bucket-storage-template.1" },
            {
              id: "template:default/google-workload-pyspark-template.1",
              dependencies: ["template:default/google-cloud-bucket-storage-template.1"],
            },
          ],
        },
      }),
    );

    const result = await getTool("get_blueprint")!.handler(
      { name: "data-product-blueprint" },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    const text = resultText(result);
    expect(text).toContain("template:default/dataproduct-template");
    expect(text).toContain("(no dependencies)");
    expect(text).toContain(
      "(depends on: `template:default/google-cloud-bucket-storage-template.1`)",
    );
  });

  it("formats an empty dependencies array as 'no dependencies'", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse({
        metadata: { name: "data-product-blueprint", title: "Data Product Blueprint" },
        spec: {
          mainTemplateId: "template:default/dataproduct-template",
          templates: [{ id: "template:default/bigquery-storage-template.1", dependencies: [] }],
        },
      }),
    );

    const result = await getTool("get_blueprint")!.handler(
      { name: "data-product-blueprint" },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain(
      "`template:default/bigquery-storage-template.1` (no dependencies)",
    );
  });
});

describe("validate_against_template", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockYamlPreviewResponse(descriptorYaml: string) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ descriptor: descriptorYaml }),
    };
  }

  // Regression test: the preview API returns { descriptor: "<yaml string>" },
  // not a parsed object with a `.components` field directly. The handler
  // must parse the YAML string before reading `.components`.
  it("parses the YAML descriptor string and extracts components", async () => {
    const descriptorYaml = [
      "components:",
      "  - id: urn:dmb:cmp:sampledomain:currency:0:currency-ingest",
      "    name: currency-ingest",
      "    useCaseTemplateId: urn:dmb:utm:google-dataproc-workload-template:0.0.0",
    ].join("\n");

    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockYamlPreviewResponse(descriptorYaml));

    const result = await getTool("validate_against_template")!.handler(
      { dataProductId: "sampledomain.currency.0", environment: "dev" },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    const text = resultText(result);
    expect(text).not.toBe("No components found in the data product descriptor.");
    expect(text).toContain("currency-ingest");
  });

  it("reports no components when the parsed descriptor has an empty components list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockYamlPreviewResponse("components: []"));

    const result = await getTool("validate_against_template")!.handler(
      { dataProductId: "sampledomain.currency.0", environment: "dev" },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toBe("No components found in the data product descriptor.");
  });

  it("returns NO_DESCRIPTOR when the preview API omits the descriptor field", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse({ validationError: "something went wrong" }),
    );

    const result = await getTool("validate_against_template")!.handler(
      { dataProductId: "sampledomain.currency.0", environment: "dev" },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("[NO_DESCRIPTOR]");
  });

  it("requires an explicit environment when no default is configured", async () => {
    globalThis.fetch = vi.fn();

    const result = await getTool("validate_against_template")!.handler(
      { dataProductId: "sampledomain.currency.0" },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("[ENVIRONMENT_REQUIRED]");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
