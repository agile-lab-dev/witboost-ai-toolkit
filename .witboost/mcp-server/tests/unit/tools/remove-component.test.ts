import { afterEach, describe, expect, it, vi } from "vitest";
import { WitboostApiClient } from "../../../src/api/client.js";
import type { WitboostConfig } from "../../../src/config/schema.js";
import "../../../src/tools/components.js";
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

function removeComponentTool() {
  const tool = getTool("remove_component");
  if (!tool) throw new Error("remove_component tool is not registered");
  return tool;
}

describe("remove_component", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetAllMocks();
  });

  it("unregisters a Git-managed component by deleting its catalog location", async () => {
    const componentName = "organization.user-compensation.0.bitol-output-port";
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          relations: [{ type: "hasPart", targetRef: `component:default/${componentName}` }],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          metadata: { name: componentName, uid: "component-uid" },
        }),
      )
      .mockResolvedValueOnce(mockJsonResponse({ data: { id: "location-id" } }))
      .mockResolvedValueOnce(mockJsonResponse(undefined, true, 204));

    const result = await removeComponentTool().handler(
      {
        dataProductId: "organization.user-compensation.0",
        componentId: `component:default/${componentName}`,
        confirm: true,
      },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(new URL(String(calls[2][0])).pathname).toBe(
      `/api/catalog/locations/by-entity/component/default/${componentName}`,
    );
    expect(new URL(String(calls[3][0])).pathname).toBe("/api/catalog/locations/location-id");
    expect(calls[3][1]?.method).toBe("DELETE");
    expect(
      calls.some(
        ([url, init]) => init?.method === "DELETE" && String(url).includes("/entities/by-name/"),
      ),
    ).toBe(false);
  });

  it("falls back to deleting by UID when the component has no catalog location", async () => {
    const componentName = "organization.user-compensation.0.bitol-output-port";
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          relations: [{ type: "hasPart", targetRef: `component:default/${componentName}` }],
        }),
      )
      .mockResolvedValueOnce(mockJsonResponse({ metadata: { uid: "component-uid" } }))
      .mockResolvedValueOnce(
        mockJsonResponse({ error: { message: "Location not found" } }, false, 404),
      )
      .mockResolvedValueOnce(mockJsonResponse(undefined, true, 204));

    const result = await removeComponentTool().handler(
      {
        dataProductId: "organization.user-compensation.0",
        componentId: "bitol-output-port",
        confirm: true,
      },
      makeContext(),
    );

    expect(result.isError).toBeFalsy();
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(new URL(String(calls[3][0])).pathname).toBe(
      "/api/catalog/entities/by-uid/component-uid",
    );
  });

  it("resolves a component URN to its catalog entity name", async () => {
    const componentName = "organization.user-compensation.0.bitol-output-port";
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          relations: [{ type: "hasPart", targetRef: `component:default/${componentName}` }],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ error: { message: "Entity unavailable" } }, false, 404),
      );

    await removeComponentTool().handler(
      {
        dataProductId: "organization.user-compensation.0",
        componentId: "urn:dmb:cmp:organization:user-compensation:0:bitol-output-port",
        confirm: true,
      },
      makeContext(),
    );

    const entityUrl = new URL(String(vi.mocked(globalThis.fetch).mock.calls[1][0]));
    expect(entityUrl.pathname).toBe(
      `/api/catalog/entities/by-name/component/default/${componentName}`,
    );
  });

  it("does not remove a component outside the data product", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockJsonResponse({ relations: [] }));

    const result = await removeComponentTool().handler(
      {
        dataProductId: "organization.user-compensation.0",
        componentId: "bitol-output-port",
        confirm: true,
      },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("[NOT_FOUND]");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("requires explicit confirmation before making API calls", async () => {
    globalThis.fetch = vi.fn();

    const result = await removeComponentTool().handler(
      {
        dataProductId: "organization.user-compensation.0",
        componentId: "bitol-output-port",
        confirm: false,
      },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("[CONFIRMATION_REQUIRED]");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("propagates governance errors returned while deleting the location", async () => {
    const componentName = "organization.user-compensation.0.bitol-output-port";
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          relations: [{ type: "hasPart", targetRef: `component:default/${componentName}` }],
        }),
      )
      .mockResolvedValueOnce(mockJsonResponse({ metadata: { uid: "component-uid" } }))
      .mockResolvedValueOnce(mockJsonResponse({ data: { id: "location-id" } }))
      .mockResolvedValueOnce(
        mockJsonResponse(
          { error: { message: "The component cannot be unregistered while deployed" } },
          false,
          422,
        ),
      );

    const result = await removeComponentTool().handler(
      {
        dataProductId: "organization.user-compensation.0",
        componentId: componentName,
        confirm: true,
      },
      makeContext(),
    );

    const resultText = (result.content[0] as { text: string }).text;
    expect(result.isError).toBe(true);
    expect(resultText).toContain("[VALIDATION_ERROR]");
    expect(resultText).toContain("The component cannot be unregistered while deployed");
  });
});
