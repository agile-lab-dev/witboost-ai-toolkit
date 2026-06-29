import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolContext } from "../../../src/tools/types.js";
import type { WitboostConfig } from "../../../src/config/schema.js";
import { WitboostApiClient } from "../../../src/api/client.js";
import { getTool, clearRegistry } from "../../../src/tools/registry.js";

// Import governance tools so they register themselves
import "../../../src/tools/governance.js";

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

describe("get_descriptor_specification", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns CUE schema when policy exists", async () => {
    const cueScript = '#DataProduct: {\n  name: string\n  version: =~"^\\\\d+\\\\.\\\\d+\\\\.\\\\d+$"\n}';
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({
        cgp_governance_entity: [
          {
            governance_entity_id: "spec-001",
            name: "Global specification compliance",
            description: "Validates descriptor structure",
            engine: "cue",
            timing: "sync",
            trigger: "active",
            status: "active",
            resource_type: { name: "dataproduct", display_name: "Data Product" },
            content: { cueScript },
            selector: null,
            preprocessing: null,
            interaction_type: null,
            additional_metadata: null,
            result_type: "policy",
            governance_entity_environments: [],
            governance_entity_tags: [],
          },
        ],
      }),
    );

    const tool = getTool("get_descriptor_specification");
    expect(tool).toBeDefined();

    const ctx = makeContext({ hasuraJwt: "valid-hasura-jwt" });
    const result = await tool!.handler({}, ctx);

    expect(result.isError).toBeFalsy();
    const text = result.content[0];
    expect(text.type).toBe("text");
    expect((text as { type: "text"; text: string }).text).toContain("# Data Product Descriptor Specification");
    expect((text as { type: "text"; text: string }).text).toContain("```cue");
    expect((text as { type: "text"; text: string }).text).toContain(cueScript);
  });

  it("uses hasuraJwt when available", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({
        cgp_governance_entity: [
          {
            governance_entity_id: "spec-001",
            name: "Global specification compliance",
            content: { cueScript: "test: string" },
            governance_entity_environments: [],
            governance_entity_tags: [],
          },
        ],
      }),
    );

    const ctx = makeContext({ hasuraJwt: "my-hasura-jwt-token" });
    await getTool("get_descriptor_specification")!.handler({}, ctx);

    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://hasura.test.witboost.com/v1/graphql");
    expect((opts as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer my-hasura-jwt-token",
      }),
    );
  });

  it("uses explicit hasuraUrl when configured", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({
        cgp_governance_entity: [
          {
            governance_entity_id: "spec-001",
            name: "Global specification compliance",
            content: { cueScript: "test: string" },
            governance_entity_environments: [],
            governance_entity_tags: [],
          },
        ],
      }),
    );

    const ctx = makeContext({
      hasuraJwt: "jwt",
      hasuraUrl: "https://custom-hasura.example.com/v1/graphql",
    });
    await getTool("get_descriptor_specification")!.handler({}, ctx);

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://custom-hasura.example.com/v1/graphql");
  });

  it("falls back to exchanged JWT when hasuraJwt is not set", async () => {
    // First call: PAT→JWT exchange, second call: Hasura GraphQL
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
          cgp_governance_entity: [
            {
              governance_entity_id: "spec-001",
              name: "Global specification compliance",
              content: { cueScript: "test: string" },
              governance_entity_environments: [],
              governance_entity_tags: [],
            },
          ],
        }),
      );

    const ctx = makeContext({ token: "wbat-my-pat-token" });
    await getTool("get_descriptor_specification")!.handler({}, ctx);

    // First call should be JWT exchange
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      "https://ui.test.witboost.com/api/auth/access-tokens/jwt",
    );
    // Second call should use exchanged JWT against Hasura
    const [hasuraUrl, hasuraOpts] = vi.mocked(globalThis.fetch).mock.calls[1];
    expect(hasuraUrl).toBe("https://hasura.test.witboost.com/v1/graphql");
    expect((hasuraOpts as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer exchanged-jwt",
      }),
    );
  });

  it("returns error when no policy found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({ cgp_governance_entity: [] }),
    );

    const ctx = makeContext({ hasuraJwt: "valid-jwt" });
    const result = await getTool("get_descriptor_specification")!.handler({}, ctx);

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No 'Global specification compliance' policy found");
  });

  it("returns error when policy has no CUE script", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlResponse({
        cgp_governance_entity: [
          {
            governance_entity_id: "spec-001",
            name: "Global specification compliance",
            content: {},
            governance_entity_environments: [],
            governance_entity_tags: [],
          },
        ],
      }),
    );

    const ctx = makeContext({ hasuraJwt: "valid-jwt" });
    const result = await getTool("get_descriptor_specification")!.handler({}, ctx);

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("has no CUE script");
  });

  it("returns error on Hasura GraphQL error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockGraphqlError([{ message: "claims key: 'https://hasura.io/jwt/claims' not found" }]),
    );

    const ctx = makeContext({ hasuraJwt: "invalid-jwt" });
    const result = await getTool("get_descriptor_specification")!.handler({}, ctx);

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("HASURA_ERROR");
    expect(text).toContain("claims key");
  });

  it("returns error on HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const ctx = makeContext({ hasuraJwt: "valid-jwt" });
    const result = await getTool("get_descriptor_specification")!.handler({}, ctx);

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("HASURA_ERROR");
    expect(text).toContain("500");
  });
});
