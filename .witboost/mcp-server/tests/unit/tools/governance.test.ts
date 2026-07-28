import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolContext } from "../../../src/tools/types.js";
import type { WitboostConfig } from "../../../src/config/schema.js";
import { WitboostApiClient } from "../../../src/api/client.js";
import { getTool } from "../../../src/tools/registry.js";

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

function mockJsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
  };
}

const policy = {
  id: "policy-001",
  name: "Global specification compliance",
  description: "Validates descriptor structure",
  engine: "cue",
  timing: "sync",
  trigger: "active",
  status: "enabled",
  resourceType: "dataproduct",
  environment: "production",
  interactionType: "validator",
  cueScript: '#DataProduct: {\n  name: string\n}',
};

const wcgListResponse = {
  data: [policy],
  meta: { pagination: { limit: 200, offset: 0, total: 1 } },
};

describe("governance tools", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses a computational governance scoped token for WCG REST calls", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ jwt: "scoped-wcg-jwt" }))
      .mockResolvedValueOnce(mockJsonResponse(wcgListResponse));

    const result = await getTool("list_policies")!.handler({}, makeContext());

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      "https://ui.test.witboost.com/api/auth/session-tokens/jwt",
    );
    expect(vi.mocked(globalThis.fetch).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          duration_seconds: 3600,
          scope: "service:computational-governance",
        }),
      }),
    );

    const [wcgUrl, wcgOpts] = vi.mocked(globalThis.fetch).mock.calls[1];
    expect(wcgUrl as string).toContain(
      "https://wcg.test.witboost.com/governance-platform/v1/computational-governance/policies",
    );
    expect((wcgOpts as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer scoped-wcg-jwt",
      }),
    );
  });

  it("lists active policies returned by WCG", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ jwt: "scoped-wcg-jwt" }))
      .mockResolvedValueOnce(mockJsonResponse(wcgListResponse));

    const result = await getTool("list_policies")!.handler({}, makeContext());

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("# All Active Policies (1)");
    expect(text).toContain("Global specification compliance");
    expect(text).toContain("```cue");
  });

  it("passes environment filters to WCG server-side", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ jwt: "scoped-wcg-jwt" }))
      .mockResolvedValueOnce(mockJsonResponse(wcgListResponse));

    const result = await getTool("list_policies")!.handler({ environment: "production" }, makeContext());

    expect(result.isError).toBeFalsy();
    const wcgUrl = vi.mocked(globalThis.fetch).mock.calls[1][0] as string;
    expect(new URL(wcgUrl).searchParams.get("env")).toBe("production");
  });

  it("returns descriptor specification from the matching WCG policy", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ jwt: "scoped-wcg-jwt" }))
      .mockResolvedValueOnce(mockJsonResponse(wcgListResponse));

    const result = await getTool("get_descriptor_specification")!.handler({}, makeContext());

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("# Data Product Descriptor Specification");
    expect(text).toContain(policy.cueScript);
  });

  it("returns WCG error on HTTP failure", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ jwt: "scoped-wcg-jwt" }))
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "The supplied authentication is invalid",
      });

    const result = await getTool("list_policies")!.handler({}, makeContext());

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("WCG_ERROR");
    expect(text).toContain("401");
  });
});
