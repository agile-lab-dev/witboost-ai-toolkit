import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolContext } from "../../../src/tools/types.js";
import type { WitboostConfig } from "../../../src/config/schema.js";
import { WitboostApiClient } from "../../../src/api/client.js";
import { getTool } from "../../../src/tools/registry.js";

// Import domain tools so they register themselves
import "../../../src/tools/domains.js";

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

function domainEntity(overrides: Record<string, unknown> = {}) {
  return {
    metadata: { name: "finance", namespace: "default", title: "Finance" },
    spec: { mesh: { name: "Finance" }, owner: "user:default/john" },
    ...overrides,
  };
}

describe("list_domains", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls the catalog API with a kind=domain filter", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse([domainEntity()]));

    const result = await getTool("list_domains")!.handler({}, makeContext());

    expect(result.isError).toBeFalsy();
    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/catalog/entities");
    expect(parsed.searchParams.get("filter")).toBe("kind=domain");
    expect(parsed.searchParams.get("fields")).toBe(
      "metadata.name,metadata.title,spec.mesh.name,metadata.namespace,spec.owner,spec.mesh,spec.subDomainOf",
    );
  });

  it("formats the short and fully-qualified domain refs", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse([domainEntity({ metadata: { name: "finance", namespace: "default", title: "Finance" } })]),
    );

    const result = await getTool("list_domains")!.handler({}, makeContext());

    expect(result.isError).toBeFalsy();
    const text = resultText(result);
    expect(text).toContain("Finance");
    expect(text).toContain("domain:finance");
    expect(text).toContain("domain:default/finance");
  });

  it("surfaces the parent domain from spec.subDomainOf, stripping the default namespace", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse([
        domainEntity({
          metadata: { name: "payments", namespace: "default", title: "Payments" },
          spec: { mesh: { name: "Payments" }, subDomainOf: "domain:default/finance" },
        }),
      ]),
    );

    const result = await getTool("list_domains")!.handler({}, makeContext());

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain("Parent domain: `domain:finance`");
  });

  it("omits the parent domain line when spec.subDomainOf is not set", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse([domainEntity({ metadata: { name: "finance", namespace: "default", title: "Finance" } })]),
    );

    const result = await getTool("list_domains")!.handler({}, makeContext());

    expect(resultText(result)).not.toContain("Parent domain");
  });

  it("falls back to spec.mesh.name for display when metadata.title is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse([
        domainEntity({
          metadata: { name: "marketing", namespace: "default" },
          spec: { mesh: { name: "Marketing Mesh" } },
        }),
      ]),
    );

    const result = await getTool("list_domains")!.handler({}, makeContext());

    expect(resultText(result)).toContain("Marketing Mesh");
  });

  it("returns a clear message when no domains are found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getTool("list_domains")!.handler({}, makeContext());

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toBe("No domains found.");
  });

  it("filters results client-side by query/search on name and title", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse([
        domainEntity({ metadata: { name: "finance", namespace: "default", title: "Finance" } }),
        domainEntity({
          metadata: { name: "marketing", namespace: "default", title: "Marketing" },
          spec: { mesh: { name: "Marketing" } },
        }),
      ]),
    );

    const result = await getTool("list_domains")!.handler({ query: "fin" }, makeContext());

    const text = resultText(result);
    expect(text).toContain("Finance");
    expect(text).not.toContain("Marketing");
  });

  it("supports the search alias and returns 'No domains found.' when nothing matches", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse([domainEntity({ metadata: { name: "finance", namespace: "default", title: "Finance" } })]),
    );

    const result = await getTool("list_domains")!.handler({ search: "nonexistent" }, makeContext());

    expect(resultText(result)).toBe("No domains found.");
  });

  it("caps the number of returned domains with limit", async () => {
    const entities = Array.from({ length: 5 }, (_, i) =>
      domainEntity({ metadata: { name: `domain-${i}`, namespace: "default", title: `Domain ${i}` } }),
    );
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse(entities));

    const result = await getTool("list_domains")!.handler({ limit: 2 }, makeContext());

    expect(resultText(result)).toContain("Found 2 domain(s)");
  });

  it("surfaces API errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ message: "boom" }),
    });

    const result = await getTool("list_domains")!.handler({}, makeContext());

    expect(result.isError).toBe(true);
  });
});
