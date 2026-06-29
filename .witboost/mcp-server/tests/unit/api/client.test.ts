import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WitboostApiClient } from "../../../src/api/client.js";
import type { WitboostConfig } from "../../../src/config/schema.js";

function makeConfig(overrides: Partial<WitboostConfig> = {}): WitboostConfig {
  return {
    baseUrl: "https://test.witboost.com",
    token: "test-token-123",
    defaultDomain: "",
    defaultEnvironment: "",
    apiVersion: "v1",
    requestTimeout: 5000,
    ...overrides,
  };
}

describe("WitboostApiClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends GET with auth header", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ items: [] }),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new WitboostApiClient(makeConfig());
    const res = await client.get("/api/catalog/entities");

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test.witboost.com/api/catalog/entities",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
        }),
      }),
    );
  });

  it("sends POST with JSON body", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: "task-1" }),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new WitboostApiClient(makeConfig());
    const res = await client.post("/api/builder/v1/templates/instantiation", {
      templateRef: "template:default/my-template",
      values: { name: "test" },
    });

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ id: "task-1" });

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(opts?.body).toBe(
      JSON.stringify({ templateRef: "template:default/my-template", values: { name: "test" } }),
    );
  });

  it("maps 401 to UNAUTHORIZED error", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ error: { message: "Invalid token" } }),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new WitboostApiClient(makeConfig());
    const res = await client.get("/api/something");

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("UNAUTHORIZED");
    expect(res.error?.message).toBe("Invalid token");
  });

  it("handles 404 Not Found", async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ error: { message: "Entity not found" } }),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new WitboostApiClient(makeConfig());
    const res = await client.get("/api/catalog/entities/by-name/system/default/missing");

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("NOT_FOUND");
  });

  it("handles 429 rate limiting", async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "30" }),
      json: async () => ({}),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new WitboostApiClient(makeConfig());
    const res = await client.get("/api/something");

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("RATE_LIMITED");
    expect(res.error?.retryAfter).toBe(30);
  });

  it("handles network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const client = new WitboostApiClient(makeConfig());
    const res = await client.get("/api/something");

    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("API_UNREACHABLE");
    expect(res.error?.message).toContain("ECONNREFUSED");
  });

  it("appends query parameters", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ([]),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new WitboostApiClient(makeConfig());
    await client.get("/api/catalog/entities", { filter: "kind=template", limit: 10 });

    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toContain("filter=kind%3Dtemplate");
    expect(url).toContain("limit=10");
  });

  it("handles 204 No Content", async () => {
    const mockResponse = {
      ok: true,
      status: 204,
      headers: new Headers(),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const client = new WitboostApiClient(makeConfig());
    const res = await client.delete("/api/something");

    expect(res.ok).toBe(true);
    expect(res.status).toBe(204);
  });

  it("exchanges PAT for JWT before API calls", async () => {
    const jwtExchangeResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ jwt: "exchanged-jwt-token" }),
    };
    const apiResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ items: [] }),
    };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jwtExchangeResponse)
      .mockResolvedValueOnce(apiResponse);

    const client = new WitboostApiClient(makeConfig({ token: "wbat-test-pat-123" }));
    const res = await client.get("/api/catalog/entities");

    expect(res.ok).toBe(true);
    // First call: JWT exchange
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(
      "https://test.witboost.com/api/auth/access-tokens/jwt",
    );
    // Second call: actual API call with exchanged JWT
    expect(vi.mocked(globalThis.fetch).mock.calls[1][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer exchanged-jwt-token",
        }),
      }),
    );
  });

  it("caches JWT across multiple PAT requests", async () => {
    const jwtExchangeResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ jwt: "cached-jwt" }),
    };
    const apiResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ items: [] }),
    };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jwtExchangeResponse)
      .mockResolvedValueOnce(apiResponse)
      .mockResolvedValueOnce(apiResponse);

    const client = new WitboostApiClient(makeConfig({ token: "wbat-test-pat-456" }));
    await client.get("/api/first");
    await client.get("/api/second");

    // Only 1 exchange call + 2 API calls = 3 total
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
