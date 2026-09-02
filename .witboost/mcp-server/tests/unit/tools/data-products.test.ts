import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WitboostApiClient } from "../../../src/api/client.js";
import type { WitboostConfig } from "../../../src/config/schema.js";
import "../../../src/tools/data-products.js";
import { getTool } from "../../../src/tools/registry.js";
import type { ToolContext } from "../../../src/tools/types.js";

function makeContext(): ToolContext {
  const config: WitboostConfig = {
    baseUrl: "https://ui.test.witboost.com",
    token: "test-token",
    defaultDomain: "",
    defaultEnvironment: "",
    apiVersion: "v1",
    requestTimeout: 5000,
  };
  return { config, api: new WitboostApiClient(config) };
}

function mockJsonResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
  };
}

function resultText(
  result: Awaited<ReturnType<NonNullable<ReturnType<typeof getTool>>["handler"]>>,
): string {
  return (result.content[0] as { type: "text"; text: string }).text;
}

function createDataProductTool() {
  const tool = getTool("create_data_product");
  if (!tool) throw new Error("create_data_product tool is not registered");
  return tool;
}

describe("create_data_product domain resolution", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects a missing domain before calling the catalog", async () => {
    globalThis.fetch = vi.fn();

    const result = await createDataProductTool().handler(
      { blueprintId: "os-fullcode-template", parameters: {} },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("[DOMAIN_REQUIRED]");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed domain refs before calling the catalog", async () => {
    globalThis.fetch = vi.fn();

    const result = await createDataProductTool().handler(
      { blueprintId: "os-fullcode-template", parameters: { domain: "finance" } },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("[INVALID_DOMAIN]");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("resolves a namespaced domain and overwrites caller-supplied domainName", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          metadata: { name: "finance", namespace: "business", title: "Finance title" },
          spec: { mesh: { name: "Finance Catalog" } },
        }),
      )
      .mockResolvedValueOnce(mockJsonResponse({ metadata: { name: "owner" }, spec: {} }))
      .mockResolvedValueOnce(mockJsonResponse({ id: "task-1" }))
      .mockResolvedValueOnce(mockJsonResponse({ id: "task-1", status: "completed" }));

    const result = await createDataProductTool().handler(
      {
        blueprintId: "os-fullcode-template",
        parameters: {
          domain: "domain:business/finance",
          domainName: "Invented name",
          dataProductOwner: "user:owner",
          identifier: "finance.cashflow.0",
        },
      },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    const domainUrl = new URL(String(vi.mocked(globalThis.fetch).mock.calls[0][0]));
    expect(domainUrl.pathname).toBe("/api/catalog/entities/by-name/domain/business/finance");
    const scaffolderRequest = vi.mocked(globalThis.fetch).mock.calls[2][1];
    const scaffolderBody = JSON.parse(String(scaffolderRequest?.body));
    expect(scaffolderBody.values.domainName).toBe("Finance Catalog");
  });
});
