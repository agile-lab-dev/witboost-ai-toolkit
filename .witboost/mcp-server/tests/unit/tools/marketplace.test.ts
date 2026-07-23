import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolContext } from "../../../src/tools/types.js";
import type { WitboostConfig } from "../../../src/config/schema.js";
import { WitboostApiClient } from "../../../src/api/client.js";
import { getTool } from "../../../src/tools/registry.js";

// Import marketplace tools so they register themselves
import "../../../src/tools/marketplace.js";

const DP_URN = "urn:dmb:dp:marketing:customer-360:1";
const OUTPUT_PORT_URN = "urn:dmb:cmp:marketing:customer-360:1:customers-op";

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

function mockJson(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockSearchResponse(documents: Array<Record<string, unknown>>, nextPageCursor?: string) {
  return {
    results: documents.map((document) => ({ type: "marketplace-projects", document })),
    nextPageCursor,
  };
}

function fetchCall(index = 0): [string, RequestInit] {
  const [url, init] = vi.mocked(globalThis.fetch).mock.calls[index];
  return [String(url), init as RequestInit];
}

function postedBody(index = 0): Record<string, unknown> {
  const [, init] = fetchCall(index);
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function resultText(result: Awaited<ReturnType<NonNullable<ReturnType<typeof getTool>>["handler"]>>): string {
  return (result.content[0] as { type: "text"; text: string }).text;
}

function dataProductDocument(overrides: Record<string, unknown> = {}) {
  return {
    title: "Customer 360",
    version: "1.0.0",
    description: "Unified customer view",
    tags: [{ tagFQN: "pii" }],
    _computedInfo: {
      urn: DP_URN,
      kind: "system",
      environment: "production",
      domain: { name: "marketing", external_id: "domain:marketing" },
      taxonomy: { name: "default", external_id: "taxonomy:default" },
      owner: { ref: "user:default/john", displayName: "John Doe" },
      consumable: true,
      publishedAt: "2026-01-15",
      in_data_contract_lineage: true,
    },
    ...overrides,
  };
}

function outputPortDocument(overrides: Record<string, unknown> = {}) {
  return {
    title: "Customers Output Port",
    version: "1.0.0",
    description: "Customer data output",
    kind: "outputport",
    outputPortType: "dremio",
    technology: "Dremio",
    platform: "analytics",
    dataContract: {
      SLA: { upTime: "99.9%", timeliness: "daily" },
      schema: [{ name: "customer_id", dataType: "string", description: "Customer id" }],
    },
    _computedInfo: {
      urn: OUTPUT_PORT_URN,
      kind: "component",
      environment: "production",
      system_urn: DP_URN,
      parent: "Customer 360",
      consumable: true,
    },
    ...overrides,
  };
}

describe("marketplace_search", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends structured environment and system filters to the Search API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockJson(mockSearchResponse([dataProductDocument()])),
    );

    const result = await getTool("marketplace_search")!.handler(
      { term: "customer", environment: "production" },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain("Customer 360");

    const [url, init] = fetchCall();
    expect(url).toBe("https://ui.test.witboost.com/api/search/query");
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer test-token" }),
    );
    expect(postedBody()).toEqual(
      expect.objectContaining({
        term: "customer",
        types: ["marketplace-projects"],
        pageLimit: 15,
        filters: {
          operator: "AND",
          filters: [
            { field: "_computedInfo.environment", operator: "eq", value: "production" },
            { field: "_computedInfo.kind", operator: "eq", value: "system" },
          ],
        },
      }),
    );
  });
});

describe("marketplace_get_data_product", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns data product details on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockJson(mockSearchResponse([dataProductDocument()])),
    );

    const result = await getTool("marketplace_get_data_product")!.handler(
      { externalId: DP_URN, environment: "production" },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    const text = resultText(result);
    expect(text).toContain("Customer 360");
    expect(text).toContain("1.0.0");
    expect(text).toContain("John Doe");
  });

  it("filters data products by urn, environment, and system kind", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockJson(mockSearchResponse([dataProductDocument()])),
    );

    await getTool("marketplace_get_data_product")!.handler(
      { externalId: DP_URN, environment: "production" },
      makeContext(),
    );

    expect(postedBody()).toEqual(
      expect.objectContaining({
        term: "customer-360",
        types: ["marketplace-projects"],
        pageLimit: 5,
        filters: {
          operator: "AND",
          filters: [
            { field: "_computedInfo.urn", operator: "eq", value: DP_URN },
            { field: "_computedInfo.environment", operator: "eq", value: "production" },
            { field: "_computedInfo.kind", operator: "eq", value: "system" },
          ],
        },
      }),
    );
  });

  it("returns error when data product is not found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJson(mockSearchResponse([])));

    const result = await getTool("marketplace_get_data_product")!.handler(
      { externalId: DP_URN, environment: "production" },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("No data product found");
    expect(resultText(result)).toContain(DP_URN);
  });

    it("returns Search API errors consistently", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockJson({ error: { message: "invalid filter" } }, 400),
    );

    const result = await getTool("marketplace_get_data_product")!.handler(
      { externalId: DP_URN, environment: "production" },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("[SEARCH_ERROR] invalid filter");
    expect(fetchCall()[0]).toBe("https://ui.test.witboost.com/api/search/query");
  });
});

describe("marketplace_get_output_ports", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns output ports for a data product", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockJson(mockSearchResponse([
        outputPortDocument(),
        outputPortDocument({
          title: "Other Output Port",
          _computedInfo: {
            urn: "urn:dmb:cmp:marketing:other:1:op",
            kind: "component",
            environment: "production",
            system_urn: "urn:dmb:dp:marketing:other:1",
            parent: "Other",
            consumable: true,
          },
        }),
      ])),
    );

    const result = await getTool("marketplace_get_output_ports")!.handler(
      { externalId: DP_URN, environment: "production" },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    const text = resultText(result);
    expect(text).toContain("Customers Output Port");
    expect(text).toContain("Customer 360");
    expect(text).not.toContain("Other Output Port");
  });

  it("filters output ports by environment, component kind, and system urn", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockJson(mockSearchResponse([outputPortDocument()])),
    );

    await getTool("marketplace_get_output_ports")!.handler(
      { externalId: DP_URN, environment: "production" },
      makeContext(),
    );

    expect(postedBody()).toEqual(
      expect.objectContaining({
        term: "",
        types: ["marketplace-projects"],
        pageLimit: 100,
        filters: {
          operator: "AND",
          filters: [
            { field: "_computedInfo.environment", operator: "eq", value: "production" },
            { field: "_computedInfo.kind", operator: "eq", value: "component" },
            { field: "_computedInfo.system_urn", operator: "eq", value: DP_URN },
          ],
        },
      }),
    );
  });

  it("returns an error message when no output ports are found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJson(mockSearchResponse([])));

    const result = await getTool("marketplace_get_output_ports")!.handler(
      { externalId: DP_URN, environment: "production" },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("No output ports found");
  });
});

describe("marketplace_get_output_port", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("filters output port lookup and fetches the data contract via REST", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockJson(mockSearchResponse([outputPortDocument()])))
      .mockResolvedValueOnce(mockJson({
        identifier: { externalId: OUTPUT_PORT_URN, environment: "production" },
        guardianPolicyId: "policy-123",
      }));

    const result = await getTool("marketplace_get_output_port")!.handler(
      { externalId: OUTPUT_PORT_URN, environment: "production" },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    const text = resultText(result);
    expect(text).toContain("Customers Output Port");
    expect(text).toContain("policy-123");

    expect(postedBody()).toEqual(
      expect.objectContaining({
        term: "customers-op",
        filters: {
          operator: "AND",
          filters: [
            { field: "_computedInfo.urn", operator: "eq", value: OUTPUT_PORT_URN },
            { field: "_computedInfo.environment", operator: "eq", value: "production" },
            { field: "_computedInfo.kind", operator: "eq", value: "component" },
          ],
        },
      }),
    );

    expect(fetchCall(1)[0]).toBe(
      `https://ui.test.witboost.com/api/marketplace/v1/data-contracts/${encodeURIComponent(OUTPUT_PORT_URN)}?environment=production`,
    );
  });
});