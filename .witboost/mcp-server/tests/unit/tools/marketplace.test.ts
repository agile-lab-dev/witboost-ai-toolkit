import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolContext } from "../../../src/tools/types.js";
import type { WitboostConfig } from "../../../src/config/schema.js";
import { WitboostApiClient } from "../../../src/api/client.js";
import { getTool, clearRegistry } from "../../../src/tools/registry.js";

// Import marketplace tools so they register themselves
import "../../../src/tools/marketplace.js";

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

function mockGraphqlResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ data }),
  };
}

function mockGraphqlError(errors: Array<{ message: string }>) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ errors }),
  };
}

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
      mockGraphqlResponse({
        instances: [
          {
            id: 42,
            name: "customer-360",
            display_name: "Customer 360",
            version: "1.0.0",
            description: "Unified customer view",
            external_id: "urn:dmb:dp:marketing:customer-360:1",
            owner: "user:default/john",
            owner_display_name: "John Doe",
            published_at: "2026-01-15",
            kind: "dataproduct",
            type: "dataproduct",
            shoppable: true,
            consumable: true,
            domains: [{ data: { name: "marketing", external_id: "domain:marketing" } }],
            taxonomy: { id: 1, external_id: "taxonomy:default", name: "default" },
            environment: { id: 1, name: "production" },
            consumedDcsCount: { aggregate: { count: 2 } },
            ownedDcsCount: { aggregate: { count: 3 } },
          },
        ],
      }),
    );

    const tool = getTool("marketplace_get_data_product");
    expect(tool).toBeDefined();

    const ctx = makeContext({ hasuraJwt: "valid-hasura-jwt" });
    const result = await tool!.handler({ id: 42 }, ctx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Customer 360");
    expect(text).toContain("1.0.0");
  });

  it("uses hasuraJwt for Hasura calls", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({
        instances: [
          {
            id: 1,
            name: "test-dp",
            display_name: "Test DP",
            version: "0.1.0",
            domains: [],
            environment: { name: "production" },
            consumedDcsCount: { aggregate: { count: 0 } },
            ownedDcsCount: { aggregate: { count: 0 } },
          },
        ],
      }),
    );

    const ctx = makeContext({ hasuraJwt: "my-hasura-jwt" });
    await getTool("marketplace_get_data_product")!.handler({ id: 1 }, ctx);

    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://hasura.test.witboost.com/v1/graphql");
    expect((opts as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer my-hasura-jwt",
      }),
    );
  });

  it("uses explicit hasuraUrl when configured", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({
        instances: [
          {
            id: 1,
            name: "test-dp",
            display_name: "Test DP",
            version: "0.1.0",
            domains: [],
            environment: { name: "production" },
            consumedDcsCount: { aggregate: { count: 0 } },
            ownedDcsCount: { aggregate: { count: 0 } },
          },
        ],
      }),
    );

    const ctx = makeContext({
      hasuraJwt: "jwt",
      hasuraUrl: "https://custom-hasura.corp.net/v1/graphql",
    });
    await getTool("marketplace_get_data_product")!.handler({ id: 1 }, ctx);

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://custom-hasura.corp.net/v1/graphql");
  });

  it("falls back to exchanged JWT when hasuraJwt is not set", async () => {
    const jwtExchangeResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ jwt: "exchanged-jwt" }),
    };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jwtExchangeResponse)
      .mockResolvedValueOnce(
        mockGraphqlResponse({
          instances: [
            {
              id: 1,
              name: "test-dp",
              display_name: "Test DP",
              version: "0.1.0",
              domains: [],
              environment: { name: "production" },
              consumedDcsCount: { aggregate: { count: 0 } },
              ownedDcsCount: { aggregate: { count: 0 } },
            },
          ],
        }),
      );

    const ctx = makeContext({ token: "wbat-my-pat" });
    await getTool("marketplace_get_data_product")!.handler({ id: 1 }, ctx);

    // First call: JWT exchange
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      "https://ui.test.witboost.com/api/auth/access-tokens/jwt",
    );
    // Second call: Hasura with exchanged JWT
    const [hasuraUrl, hasuraOpts] = vi.mocked(globalThis.fetch).mock.calls[1];
    expect(hasuraUrl).toBe("https://hasura.test.witboost.com/v1/graphql");
    expect((hasuraOpts as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer exchanged-jwt",
      }),
    );
  });

  it("returns error when data product not found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({ instances: [] }),
    );

    const ctx = makeContext({ hasuraJwt: "valid-jwt" });
    const result = await getTool("marketplace_get_data_product")!.handler({ id: 999 }, ctx);

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No data product found");
    expect(text).toContain("999");
  });

  it("returns error on Hasura GraphQL error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlError([{ message: "claims key: 'https://hasura.io/jwt/claims' not found" }]),
    );

    const ctx = makeContext({ hasuraJwt: "bad-jwt" });
    const result = await getTool("marketplace_get_data_product")!.handler({ id: 1 }, ctx);

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("HASURA_ERROR");
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
      mockGraphqlResponse({
        instances: [
          {
            id: 42,
            name: "customer-360",
            display_name: "Customer 360",
            version: "1.0.0",
            description: "Unified view",
            shoppable: true,
            consumable: true,
            descriptor: {},
            components: [
              {
                data: {
                  id: 100,
                  name: "customer-output-port",
                  display_name: "Customer Output Port",
                  external_id: "urn:dmb:cmp:marketing:customer-360:1:output-port",
                  kind: "outputport",
                  type: "dremio",
                  version: "1.0.0",
                  description: "Customer data output",
                  consumable: true,
                  shoppable: true,
                  descriptor: {},
                },
              },
            ],
          },
        ],
      }),
    );

    const ctx = makeContext({ hasuraJwt: "valid-jwt" });
    const result = await getTool("marketplace_get_output_ports")!.handler({ id: 42 }, ctx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Customer Output Port");
    expect(text).toContain("Customer 360");
  });

  it("uses hasuraJwt for authentication", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({
        instances: [
          {
            id: 1,
            name: "dp",
            display_name: "DP",
            components: [{ data: { id: 10, name: "port", display_name: "Port" } }],
          },
        ],
      }),
    );

    const ctx = makeContext({ hasuraJwt: "hasura-jwt-123" });
    await getTool("marketplace_get_output_ports")!.handler({ id: 1 }, ctx);

    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://hasura.test.witboost.com/v1/graphql");
    expect((opts as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer hasura-jwt-123" }),
    );
  });

  it("returns message when no output ports", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({
        instances: [
          {
            id: 42,
            name: "empty-dp",
            display_name: "Empty DP",
            components: [],
          },
        ],
      }),
    );

    const ctx = makeContext({ hasuraJwt: "valid-jwt" });
    const result = await getTool("marketplace_get_output_ports")!.handler({ id: 42 }, ctx);

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("no output ports");
  });
});
